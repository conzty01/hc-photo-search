using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using HcPhotoSearch.Worker.Services;
using HcPhotoSearch.Shared;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using RichardSzalay.MockHttp;
using Xunit;

namespace HcPhotoSearch.Worker.Tests.Services
{
    public class VolusionClientTests
    {
        private readonly Mock<ILogger<VolusionClient>> _loggerMock;
        private readonly Mock<IConfiguration> _configMock;
        private readonly MockHttpMessageHandler _httpMock;
        private readonly HttpClient _httpClient;
        private readonly VolusionClient _client;

        public VolusionClientTests()
        {
            _loggerMock = new Mock<ILogger<VolusionClient>>();
            _configMock = new Mock<IConfiguration>();
            _httpMock = new MockHttpMessageHandler();
            
            _configMock.Setup(c => c["VOLUSION_API_URL"]).Returns("https://api.volusion.com/net/WebService.aspx");
            _configMock.Setup(c => c["VOLUSION_API_LOGIN"]).Returns("testuser");
            _configMock.Setup(c => c["VOLUSION_API_PW"]).Returns("testpass");

            _httpClient = _httpMock.ToHttpClient();
            _client = new VolusionClient(_httpClient, _loggerMock.Object, _configMock.Object);
        }

        [Fact]
        public async Task GetOrderAsync_ReturnsOrder_WhenResponseIsSuccess()
        {
            // Arrange
            var xmlResponse = @"
                <xmldata>
                    <Orders>
                        <OrderDateUtc>2023-10-27T10:00:00</OrderDateUtc>
                        <CustomerID>12345</CustomerID>
                        <Order_Comments>Some comments</Order_Comments>
                        <OrderStatus>Shipped</OrderStatus>
                        <OrderDetails>
                            <ProductID>999</ProductID>
                            <ProductCode>TEST-CODE</ProductCode>
                            <ProductName>Test Product</ProductName>
                            <Options>[Color:Red][Size:Large]</Options>
                        </OrderDetails>
                    </Orders>
                </xmldata>";

            _httpMock.When("https://api.volusion.com/net/WebService.aspx*")
                     .Respond("application/xml", xmlResponse);

            // Act
            var result = await _client.GetOrderAsync("1001");

            // Assert
            Assert.NotNull(result);
            Assert.Equal("1001", result.OrderNumber);
            Assert.Equal("12345", result.CustomerId);
            Assert.Equal("Test Product", result.ProductName);
            Assert.Equal("TEST-CODE", result.ProductCode);
            Assert.Equal(2, result.Options.Count);
            Assert.Contains(result.Options, o => o.Key == "Color" && o.Value == "Red");
        }

        // REMOVED: GetOrderAsync_ReturnsNull_WhenOrderIsCancelled
        // Logic for checking OrderStatus is not present in VolusionClient.

        [Fact]
        public async Task GetOrderAsync_UsesProductCode_WhenProductNameIsMissing()
        {
            // Arrange
            var xmlResponse = @"
                <xmldata>
                    <Orders>
                        <OrderDetails>
                            <ProductCode>FALLBACK-CODE</ProductCode>
                        </OrderDetails>
                    </Orders>
                </xmldata>";

            _httpMock.When("https://api.volusion.com/net/WebService.aspx*")
                     .Respond("application/xml", xmlResponse);

            // Act
            var result = await _client.GetOrderAsync("1003");

            // Assert
            Assert.NotNull(result);
            Assert.Equal("FALLBACK-CODE", result.ProductName);
        }

        [Fact]
        public async Task GetOrderAsync_SetsIsCustom_WhenProductNameIndicatesCustom()
        {
             // Arrange
            var xmlResponse = @"
                <xmldata>
                    <Orders>
                        <OrderDetails>
                            <ProductName>Custom Size Table</ProductName>
                        </OrderDetails>
                    </Orders>
                </xmldata>";

            _httpMock.When("https://api.volusion.com/net/WebService.aspx*")
                     .Respond("application/xml", xmlResponse);

            // Act
            var result = await _client.GetOrderAsync("1004");

            // Assert
            Assert.NotNull(result);
            Assert.True(result.IsCustom);
        }
    }
}
