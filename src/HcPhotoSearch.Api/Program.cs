using HcPhotoSearch.Shared;
using Meilisearch;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Meilisearch Client
builder.Services.AddSingleton<MeilisearchClient>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var url = config["MEILISEARCH_URL"] ?? "http://localhost:7700";
    var key = config["MEILISEARCH_MASTER_KEY"];
    return new MeilisearchClient(url, key);
});

// Volusion Client
builder.Services.AddHttpClient<VolusionClient>();

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

// Search Endpoint
app.MapGet("/search", async (string q, string? filter, int? limit, MeilisearchClient client, IConfiguration config) =>
{
    var index = client.Index("orders");
    var result = await index.SearchAsync<OrderMeta>(q, new SearchQuery
    {
        Limit = limit ?? 50,
        AttributesToHighlight = new[] { "productName", "options.value" },
        Filter = filter
    });


    var displayPath = config["ORDERS_DISPLAY_PATH"] ?? config["ORDERS_PATH"] ?? "/mnt/orders";
    foreach (var hit in result.Hits)
    {
        hit.PhotoPath = Path.Combine(displayPath, hit.OrderNumber);
    }

    return Results.Ok(result);
})
.WithName("SearchOrders")
.WithOpenApi();

// Autocomplete Values Endpoint
app.MapGet("/search/autocomplete-values", async (string field, string? filter, MeilisearchClient client) =>
{
    var index = client.Index("orders");
    
    // We use a search with limit 0 to get just the facet distribution
    var result = await index.SearchAsync<OrderMeta>("", new SearchQuery
    {
        Limit = 0,
        Facets = new[] { field },
        Filter = filter
    });

    if (result.FacetDistribution != null && result.FacetDistribution.ContainsKey(field))
    {
        var values = result.FacetDistribution[field].Keys.ToList();
        var response = new Dictionary<string, List<string>>
        {
            { field, values }
        };
        return Results.Ok(response);
    }

    return Results.Ok(new Dictionary<string, List<string>> { { field, new List<string>() } });
})
.WithName("GetAutocompleteValues")
.WithOpenApi();

// Get Order Endpoint
app.MapGet("/orders/{id}", async (string id, IConfiguration config) =>
{
    var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
    var orderPath = Path.Combine(ordersPath, id);
    var metaPath = Path.Combine(orderPath, "order.meta.json");

    if (File.Exists(metaPath))
    {
        var json = await File.ReadAllTextAsync(metaPath);
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
        var meta = JsonSerializer.Deserialize<OrderMeta>(json, options);
        var displayPath = config["ORDERS_DISPLAY_PATH"] ?? config["ORDERS_PATH"] ?? "/mnt/orders";
        if (meta != null)
        {
            meta.PhotoPath = Path.Combine(displayPath, meta.OrderNumber);
        }
        return Results.Ok(meta);
    }
    return Results.NotFound();
})
.WithName("GetOrder")
.WithOpenApi();

// Reindex Endpoint - Create trigger file
app.MapPost("/admin/reindex", async (IConfiguration config) =>
{
    try
    {
        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var triggerPath = Path.Combine(ordersPath, "reindex.trigger");
        var statusPath = Path.Combine(ordersPath, "reindex.status.json");

        // Check if already running
        if (File.Exists(statusPath))
        {
            var statusJson = await File.ReadAllTextAsync(statusPath);
            var existingStatus = JsonSerializer.Deserialize<ReindexStatus>(statusJson);
            if (existingStatus?.IsRunning == true)
            {
                return Results.Conflict(new { Message = "Reindex is already running" });
            }
        }

        // Create trigger file
        await File.WriteAllTextAsync(triggerPath, DateTime.UtcNow.ToString());

        return Results.Accepted(value: new { Message = "Reindex triggered successfully" });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("Reindex")
.WithOpenApi();

// Incremental Index Endpoint - Create incremental trigger file
app.MapPost("/admin/incremental", async (IConfiguration config) =>
{
    try
    {
        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var triggerPath = Path.Combine(ordersPath, "incremental.trigger");
        var statusPath = Path.Combine(ordersPath, "reindex.status.json");

        // Check if already running
        if (File.Exists(statusPath))
        {
            var statusJson = await File.ReadAllTextAsync(statusPath);
            var existingStatus = JsonSerializer.Deserialize<ReindexStatus>(statusJson);
            if (existingStatus?.IsRunning == true)
            {
                return Results.Conflict(new { Message = "Indexing is already running" });
            }
        }

        // Create trigger file
        await File.WriteAllTextAsync(triggerPath, DateTime.UtcNow.ToString());

        return Results.Accepted(value: new { Message = "Incremental index triggered successfully" });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("IncrementalIndex")
.WithOpenApi();

// Reindex Status Endpoint
app.MapGet("/admin/reindex/status", async (IConfiguration config) =>
{
    try
    {
        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var statusPath = Path.Combine(ordersPath, "reindex.status.json");

        if (File.Exists(statusPath))
        {
            var statusJson = await File.ReadAllTextAsync(statusPath);
            var status = JsonSerializer.Deserialize<ReindexStatus>(statusJson);
            return Results.Ok(status);
        }

        // Return default idle status
        return Results.Ok(new ReindexStatus
        {
            IsRunning = false,
            StartTime = null,
            EndTime = null,
            ProcessedOrders = 0,
            TotalOrders = 0,
            CurrentOrder = null,
            Error = null,
            LastCompletedRun = null
        });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("ReindexStatus")
.WithOpenApi();

// Update Order Endpoint
app.MapPut("/admin/orders/{orderNumber}", async (string orderNumber, [FromBody] OrderMeta orderMeta, IConfiguration config, MeilisearchClient client) =>
{
    try
    {
        // Validate order number matches
        if (orderNumber != orderMeta.OrderNumber)
        {
            return Results.BadRequest(new { Message = "Order number in URL does not match order number in JSON body" });
        }

        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var orderPath = Path.Combine(ordersPath, orderNumber);
        var metaPath = Path.Combine(orderPath, "order.meta.json");

        // Check if order exists
        if (!Directory.Exists(orderPath))
        {
            return Results.NotFound(new { Message = $"Order {orderNumber} not found" });
        }

        // Update timestamp
        orderMeta.LastIndexedUtc = DateTime.UtcNow;

        // Serialize to JSON
        var json = JsonSerializer.Serialize(orderMeta, new JsonSerializerOptions 
        { 
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        string? filesystemError = null;
        string? meilisearchError = null;

        // Try to write to filesystem
        try
        {
            await File.WriteAllTextAsync(metaPath, json);
        }
        catch (Exception ex)
        {
            filesystemError = ex.Message;
        }

        // Try to update Meilisearch
        try
        {
            var index = client.Index("orders");
            await index.UpdateDocumentsAsync(new[] { orderMeta });
        }
        catch (Exception ex)
        {
            meilisearchError = ex.Message;
        }

        // Check if both operations succeeded
        if (filesystemError != null || meilisearchError != null)
        {
            var errors = new List<string>();
            if (filesystemError != null) errors.Add($"Filesystem: {filesystemError}");
            if (meilisearchError != null) errors.Add($"Meilisearch: {meilisearchError}");
            
            return Results.Problem(
                detail: string.Join("; ", errors),
                statusCode: 500,
                title: "Partial update failure"
            );
        }

        return Results.Ok(new { Message = "Order updated successfully", OrderMeta = orderMeta });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("UpdateOrder")
.WithOpenApi();

// Reindex Single Order Endpoint
app.MapPost("/admin/orders/{orderNumber}/reindex", async (string orderNumber, IConfiguration config, VolusionClient volusionClient, MeilisearchClient msClient) =>
{
    try
    {
        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var orderPath = Path.Combine(ordersPath, orderNumber);
        var metaPath = Path.Combine(orderPath, "order.meta.json");

        // Check if order directory exists
        if (!Directory.Exists(orderPath))
        {
            return Results.NotFound(new { Message = $"Order directory {orderNumber} not found" });
        }

        // Fetch fresh data from Volusion
        var orderMeta = await volusionClient.GetOrderAsync(orderNumber);
        
        if (orderMeta == null)
        {
            return Results.Problem(
                detail: "Failed to fetch order data from Volusion API. The order may not exist or the API may be unavailable.",
                statusCode: 500,
                title: "Volusion API Error"
            );
        }

        // Check if photos exist (logic kept just in case but property removed)
        // var photoFiles = Directory.GetFiles(orderPath, "*.*")

        // Preserve the existing needsReview state if file exists
        if (File.Exists(metaPath))
        {
            try
            {
                var existingJson = await File.ReadAllTextAsync(metaPath);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var existingMeta = JsonSerializer.Deserialize<OrderMeta>(existingJson, options);
                if (existingMeta != null)
                {
                    orderMeta.NeedsReview = existingMeta.NeedsReview;
                }
            }
            catch
            {
                // If we can't read the existing file, use the new value (which is false by default)
            }
        }

        // Update timestamp
        orderMeta.LastIndexedUtc = DateTime.UtcNow;

        // Serialize to JSON
        var json = JsonSerializer.Serialize(orderMeta, new JsonSerializerOptions 
        { 
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        string? filesystemError = null;
        string? meilisearchError = null;

        // Try to write to filesystem
        try
        {
            await File.WriteAllTextAsync(metaPath, json);
        }
        catch (Exception ex)
        {
            filesystemError = ex.Message;
        }

        // Try to update Meilisearch
        try
        {
            var index = msClient.Index("orders");
            await index.UpdateDocumentsAsync(new[] { orderMeta });
        }
        catch (Exception ex)
        {
            meilisearchError = ex.Message;
        }

        // Check if both operations succeeded
        if (filesystemError != null || meilisearchError != null)
        {
            var errors = new List<string>();
            if (filesystemError != null) errors.Add($"Filesystem: {filesystemError}");
            if (meilisearchError != null) errors.Add($"Meilisearch: {meilisearchError}");
            
            return Results.Problem(
                detail: string.Join("; ", errors),
                statusCode: 500,
                title: "Partial update failure"
            );
        }

        var displayPath = config["ORDERS_DISPLAY_PATH"] ?? config["ORDERS_PATH"] ?? "/mnt/orders";
        orderMeta.PhotoPath = Path.Combine(displayPath, orderMeta.OrderNumber);

        return Results.Ok(new { Message = "Order reindexed successfully", OrderMeta = orderMeta });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("ReindexOrder")
.WithOpenApi();

// Upload Photos Endpoint
app.MapPost("/upload-photos", async (HttpRequest request, IConfiguration config) =>
{
    try
    {
        if (!request.HasFormContentType)
            return Results.BadRequest("Invalid content type. Expected multipart/form-data.");

        var form = await request.ReadFormAsync();
        var orderNumber = form["orderNumber"].ToString();
        var files = form.Files;

        if (string.IsNullOrWhiteSpace(orderNumber) || !files.Any())
            return Results.BadRequest("Order number and at least one file are required.");

        // Validate order number (alphanumeric check)
        if (!orderNumber.All(char.IsLetterOrDigit))
            return Results.BadRequest("Order number must be alphanumeric.");

        var ordersPath = config["ORDERS_PATH"] ?? "/mnt/orders";
        var orderPath = Path.Combine(ordersPath, orderNumber);

        // Create directory if it doesn't exist
        if (!Directory.Exists(orderPath))
        {
            Directory.CreateDirectory(orderPath);
        }

        int successCount = 0;
        var savedFiles = new List<string>();

        foreach (var file in files)
        {
            if (file.Length > 0)
            {
                var ext = Path.GetExtension(file.FileName);
                // Timestamp to avoid collisions
                var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmssfff");
                var safeFileName = Path.GetFileNameWithoutExtension(file.FileName);
                // Simple hygiene on filename
                safeFileName = new string(safeFileName.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
                
                var newFileName = $"{safeFileName}_{timestamp}{ext}";
                var filePath = Path.Combine(orderPath, newFileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }
                savedFiles.Add(newFileName);
                successCount++;
            }
        }

        // Trigger incremental index
        var triggerPath = Path.Combine(ordersPath, "incremental.trigger");
        // We write the current timestamp to the trigger file
        await File.WriteAllTextAsync(triggerPath, DateTime.UtcNow.ToString());

        return Results.Ok(new { Message = $"Uploaded {successCount} files.", Files = savedFiles, OrderPath = orderPath });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
})
.WithName("UploadPhotos")
.WithOpenApi()
.DisableAntiforgery();

app.Run();
