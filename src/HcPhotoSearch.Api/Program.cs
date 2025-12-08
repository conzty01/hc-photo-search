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
app.MapGet("/search", async (string q, string? filter, int? limit, MeilisearchClient client) =>
{
    var index = client.Index("orders");
    var result = await index.SearchAsync<OrderMeta>(q, new SearchQuery
    {
        Limit = limit ?? 50,
        AttributesToHighlight = new[] { "productName", "options.value" },
        Filter = filter
    });
    return Results.Ok(result);
})
.WithName("SearchOrders")
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
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
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

app.Run();
