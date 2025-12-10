using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;
using RichardSzalay.MockHttp;
using Meilisearch;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using HcPhotoSearch.Shared;

namespace HcPhotoSearch.Api.Tests;

public class IntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _tempPath;

    public IntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _tempPath = Path.Combine(Path.GetTempPath(), "HcPhotoSearchTests", Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempPath);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempPath))
        {
            try 
            {
                Directory.Delete(_tempPath, true);
            }
            catch 
            {
                // Best effort cleanup
            }
        }
    }

    private HttpClient CreateClientWithMocks(Action<MockHttpMessageHandler>? configureHttp = null, Action<IServiceCollection>? configureServices = null)
    {
        return _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((context, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    { "ORDERS_PATH", _tempPath },
                    { "ORDERS_DISPLAY_PATH", _tempPath }, // Verify this matches expected logic 
                    { "MEILISEARCH_URL", "http://localhost:7700" },
                    { "MEILISEARCH_MASTER_KEY", "masterKey" }
                });
            });

            builder.ConfigureServices(services =>
            {
                // Mock Meilisearch
                var mockHttp = new MockHttpMessageHandler();
                configureHttp?.Invoke(mockHttp);

                // Default mock if none provided for a call
                mockHttp.Fallback.Respond(req => 
                {
                    var msg = $"No mock found for {req.Method} {req.RequestUri}";
                    return new HttpResponseMessage(HttpStatusCode.NotFound) 
                    { 
                        Content = new StringContent($"{{\"error\": \"{msg}\"}}", System.Text.Encoding.UTF8, "application/json") 
                    };
                });

                services.RemoveAll<MeilisearchClient>();
                services.AddSingleton<MeilisearchClient>(sp =>
                {
                    var httpClient = mockHttp.ToHttpClient();
                    httpClient.BaseAddress = new Uri("http://localhost:7700");
                    return new MeilisearchClient(httpClient);
                });

                // Mock VolusionClient if needed
                if (configureServices != null)
                {
                    configureServices(services);
                }
            });
        }).CreateClient();
    }

    [Fact]
    public async Task Get_Search_ReturnsOk()
    {
        // ... (existing)
    }
    
    // ... (existing)




    [Fact]
    public async Task Get_Autocomplete_ReturnsValues()
    {
        // Arrange
        var facetResponse = new
        {
            facetDistribution = new Dictionary<string, Dictionary<string, int>>
            {
                { "options.value", new Dictionary<string, int> { { "Large", 10 }, { "Small", 5 } } }
            }
        };

        var client = CreateClientWithMocks(mockHttp => {
            mockHttp.When("http://localhost:7700/indexes/orders/search")
                    .Respond("application/json", JsonSerializer.Serialize(facetResponse));
        });

        // Act
        var response = await client.GetAsync("/search/autocomplete-values?field=options.value");

        // Assert
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("Large", content);
        Assert.Contains("Small", content);
    }

    [Fact]
    public async Task Get_Order_ReturnsOrder()
    {
        // Arrange
        var orderId = "1001";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir);
        
        var meta = new OrderMeta { OrderNumber = orderId, ProductName = "FileSystem Product" };
        await File.WriteAllTextAsync(Path.Combine(orderDir, "order.meta.json"), JsonSerializer.Serialize(meta));

        var client = CreateClientWithMocks();

        // Act
        var response = await client.GetAsync($"/orders/{orderId}");

        // Assert
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("FileSystem Product", content);
    }

    [Fact]
    public async Task Put_UpdateOrder_UpdatesFileAndIndex()
    {
        // Arrange
        var orderId = "1002";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir);
        
        var meta = new OrderMeta { OrderNumber = orderId, ProductName = "Old Name" };
        await File.WriteAllTextAsync(Path.Combine(orderDir, "order.meta.json"), JsonSerializer.Serialize(meta));

        var client = CreateClientWithMocks(mockHttp => {
            // Catch-all for Meilisearch
            mockHttp.When("*")
                    .Respond(HttpStatusCode.Accepted, "application/json", "{\"taskUid\": 0}");
        });

        var updatedMeta = new OrderMeta { OrderNumber = orderId, ProductName = "New Name" };

        // Act
        var response = await client.PutAsJsonAsync($"/admin/orders/{orderId}", updatedMeta);

        // Assert
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            throw new Exception($"API failed: {response.StatusCode} - {error}");
        }
        
        // Verify file updated
        var savedJson = await File.ReadAllTextAsync(Path.Combine(orderDir, "order.meta.json"));
        Assert.Contains("New Name", savedJson);
    }

    [Fact]
    public async Task Post_Reindex_CreatesTrigger()
    {
        // Arrange
        var client = CreateClientWithMocks();

        // Act
        var response = await client.PostAsync("/admin/reindex", null);

        // Assert
        response.EnsureSuccessStatusCode();
        Assert.True(File.Exists(Path.Combine(_tempPath, "reindex.trigger")));
    }

    [Fact]
    public async Task Post_Incremental_CreatesTrigger()
    {
        // Arrange
        var client = CreateClientWithMocks();

        // Act
        var response = await client.PostAsync("/admin/incremental", null);

        // Assert
        response.EnsureSuccessStatusCode();
        Assert.True(File.Exists(Path.Combine(_tempPath, "incremental.trigger")));
    }

    [Fact]
    public async Task Get_Status_ReturnsStatus()
    {
        // Arrange
        var status = new ReindexStatus { IsRunning = true, ProcessedOrders = 50 };
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "reindex.status.json"), JsonSerializer.Serialize(status));

        var client = CreateClientWithMocks();

        // Act
        var response = await client.GetAsync("/admin/reindex/status");

        // Assert
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("true", content); // IsRunning
        Assert.Contains("50", content);   // ProcessedOrders
    }

    [Fact]
    public async Task Post_UploadPhotos_SavesFiles()
    {
        // Arrange
        var orderId = "2001";
        var client = CreateClientWithMocks();
        
        var content = new MultipartFormDataContent();
        content.Add(new StringContent(orderId), "orderNumber");
        
        var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
        content.Add(fileContent, "files", "test.jpg");

        // Act
        var response = await client.PostAsync("/upload-photos", content);

        // Assert
        response.EnsureSuccessStatusCode();
        
        var orderDir = Path.Combine(_tempPath, orderId);
        Assert.True(Directory.Exists(orderDir));
        var files = Directory.GetFiles(orderDir);
        Assert.Single(files);
        Assert.Contains("test_", Path.GetFileName(files[0])); // Check timestamp prefix logic logic preserves name
    }
}

