using System;
using System.IO;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Moq;
using Xunit;
using RichardSzalay.MockHttp;
using HcPhotoSearch.Shared;
using HcPhotoSearch.Worker.Services;

namespace HcPhotoSearch.Worker.Tests;

public class WorkerIntegrationTests : IDisposable
{
    private readonly string _tempPath;
    private readonly Mock<ILogger<Worker>> _loggerMock;
    private readonly Mock<MeiliSearchService> _meiliMock;
    private readonly MockHttpMessageHandler _httpMock;
    private readonly IConfiguration _configuration;
    private readonly VolusionClient _volusionClient;

    public WorkerIntegrationTests()
    {
        // Setup Temp Dir
        _tempPath = Path.Combine(Path.GetTempPath(), "WorkerTests_" + Guid.NewGuid());
        Directory.CreateDirectory(_tempPath);

        // Config with mocked path
        var configData = new Dictionary<string, string>
        {
            { "ORDERS_PATH", _tempPath },
            { "VOLUSION_API_LOGIN", "user" },
            { "VOLUSION_API_PW", "pass" },
            { "VOLUSION_API_URL", "http://volusion.test/api" }
        };
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(configData).Build();

        // Mocks
        _loggerMock = new Mock<ILogger<Worker>>();
        
        // Mock MeiliSearchService (methods are virtual now)
        _meiliMock = new Mock<MeiliSearchService>(_configuration, new Mock<ILogger<MeiliSearchService>>().Object);
        _meiliMock.Setup(m => m.InitializeAsync()).Returns(Task.CompletedTask);
        _meiliMock.Setup(m => m.UpsertOrderAsync(It.IsAny<OrderMeta>())).Returns(Task.CompletedTask);

        // Setup VolusionClient with MockHttp
        _httpMock = new MockHttpMessageHandler();
        var httpClient = _httpMock.ToHttpClient();
        // Since VolusionClient doesn't have virtual methods, we use the real class with mocked HttpClient
        _volusionClient = new VolusionClient(httpClient, new Mock<ILogger<VolusionClient>>().Object, _configuration);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempPath))
        {
            try { Directory.Delete(_tempPath, true); } catch { }
        }
    }
    
    // Helper to get Worker instance
    private Worker CreateWorker()
    {
        // We need to bypass MeiliSearchService logic if it tries to hit real server init.
        // If MeiliSearchService.InitializeAsync hits real server, we need to mock it.
        // I'll assume MeiliSearchService methods are virtual for now or just mock the dependencies.
        // If MeiliSearchService is not mockable, I might fail compilation or runtime. 
        // Safer bet: Extend MeiliSearchService or assume it's mockable.
        return new Worker(_loggerMock.Object, _volusionClient, _meiliMock.Object, _configuration);
    }
    
    [Fact]
    public async Task Incremental_ProcessesNewOrders()
    {
         // Arrange
        var orderId = "5001";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir); // Empty, so NeedsReview logic might be skipped/default
        
        // Mock Volusion Response
        _httpMock.When("*")
                 .Respond("application/xml", GenerateVolusionXml(orderId));

        // Create Trigger
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "incremental.trigger"), "now");

        // Act
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var worker = CreateWorker();
        await worker.StartAsync(cts.Token);
        
        // Wait for loop
        await Task.Delay(1000);
        await worker.StopAsync(CancellationToken.None);

        // Assert
        Assert.False(File.Exists(Path.Combine(_tempPath, "incremental.trigger")), "Trigger file should be deleted");
        Assert.True(File.Exists(Path.Combine(orderDir, "order.meta.json")), "Meta file should be created");
        
        var json = await File.ReadAllTextAsync(Path.Combine(orderDir, "order.meta.json"));
        Assert.Contains("Test Product", json);
    }

    [Fact]
    public async Task FullReindex_ProcessesAllOrders()
    {
         // Arrange
        var orderId = "5002";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir);
        
        // Existing file to be updated
        await File.WriteAllTextAsync(Path.Combine(orderDir, "order.meta.json"), "{}");

        _httpMock.When("*").Respond("application/xml", GenerateVolusionXml(orderId, "Updated Product"));
        
        // Create Trigger
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "reindex.trigger"), "now");

        // Act
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var worker = CreateWorker();
        await worker.StartAsync(cts.Token);
        
        await Task.Delay(1000);
        await worker.StopAsync(CancellationToken.None);

        // Assert
        Assert.False(File.Exists(Path.Combine(_tempPath, "reindex.trigger")));
        var json = await File.ReadAllTextAsync(Path.Combine(orderDir, "order.meta.json"));
        Assert.Contains("Updated Product", json);
    }
    
    [Fact]
    public async Task NeedsReview_FlagsCustomOrders()
    {
        // Arrange
        var orderId = "5003";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir);
        
        // Mock: Custom Order
        var xml = GenerateVolusionXml(orderId, "Custom Table", "CUST-123");
        _httpMock.When("*").Respond("application/xml", xml);
        
        // Incremental Trigger
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "incremental.trigger"), "now");
        
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var worker = CreateWorker();
        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);
        await worker.StopAsync(CancellationToken.None);

        // Assert
        var json = await File.ReadAllTextAsync(Path.Combine(orderDir, "order.meta.json"));
        var meta = JsonSerializer.Deserialize<OrderMeta>(json);
        Assert.True(meta.IsCustom, "Should be custom");
        Assert.True(meta.NeedsReview, "Should be flagged for review");
    }

    [Fact]
    public async Task NeedsReview_PreservesResult()
    {
        // Arrange
        var orderId = "5004";
        var orderDir = Path.Combine(_tempPath, orderId);
        Directory.CreateDirectory(orderDir);
        
        // Existing: NeedsReview = True
        var existing = new OrderMeta { OrderNumber = orderId, NeedsReview = true, ProductName = "Old" };
        await File.WriteAllTextAsync(Path.Combine(orderDir, "order.meta.json"), JsonSerializer.Serialize(existing));
        
        // Mock: Normal order (would NOT flag if new)
        var xml = GenerateVolusionXml(orderId, "Standard Table"); // Not custom
        _httpMock.When("*").Respond("application/xml", xml);
        
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "reindex.trigger"), "now");
        
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var worker = CreateWorker();
        await worker.StartAsync(cts.Token);
        await Task.Delay(1000);
        await worker.StopAsync(CancellationToken.None);

        // Assert
        var json = await File.ReadAllTextAsync(Path.Combine(orderDir, "order.meta.json"));
        var meta = JsonSerializer.Deserialize<OrderMeta>(json);
        Assert.True(meta.NeedsReview, "Should preserve existing NeedsReview=true");
        Assert.Equal("Standard Table", meta.ProductName); // Data updated
    }
    
    [Fact]
    public async Task VolusionFailure_HandlesGracefully()
    {
        // Arrange
        var orderId1 = "5005";
        var orderId2 = "5006";
        
        Directory.CreateDirectory(Path.Combine(_tempPath, orderId1));
        Directory.CreateDirectory(Path.Combine(_tempPath, orderId2));
        
        // Mock: Order 1 Fails (500), Order 2 Succeeds
        _httpMock.When("*")
                 .Respond(req => 
                 {
                     var uri = req.RequestUri.ToString();
                     if (uri.Contains("5005")) return new HttpResponseMessage(HttpStatusCode.InternalServerError);
                     if (uri.Contains("5006")) 
                     {
                         return new HttpResponseMessage(HttpStatusCode.OK) 
                         { 
                             Content = new StringContent(GenerateVolusionXml(orderId2), System.Text.Encoding.UTF8, "application/xml") 
                         };
                     }
                     // Fallback for others
                     return new HttpResponseMessage(HttpStatusCode.NotFound);
                 });
        
        await File.WriteAllTextAsync(Path.Combine(_tempPath, "reindex.trigger"), "now");
        
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var worker = CreateWorker();
        await worker.StartAsync(cts.Token);
        await Task.Delay(3000);
        await worker.StopAsync(CancellationToken.None);

        // Assert
        // Order 1: Should NOT have meta file (skipped)
        Assert.False(File.Exists(Path.Combine(_tempPath, orderId1, "order.meta.json")), "Failed order should be skipped");
        
        // Order 2: Should have meta file
        Assert.True(File.Exists(Path.Combine(_tempPath, orderId2, "order.meta.json")), "Success order should be processed");
    }

    private string GenerateVolusionXml(string id, string name = "Test Product", string code = "TEST")
    {
        return $@"<xmldata>
                    <Orders>
                        <OrderDateUtc>{DateTime.UtcNow:s}</OrderDateUtc>
                        <CustomerID>123</CustomerID>
                        <Order_Comments>Comments</Order_Comments>
                        <OrderDetails>
                            <ProductID>1</ProductID>
                            <ProductCode>{code}</ProductCode>
                            <ProductName>{name}</ProductName>
                            <Options></Options>
                        </OrderDetails>
                    </Orders>
                </xmldata>";
    }
}
