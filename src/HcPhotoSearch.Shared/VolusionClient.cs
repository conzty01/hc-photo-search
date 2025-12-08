using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace HcPhotoSearch.Shared
{
    public class VolusionClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<VolusionClient> _logger;
        private readonly string _apiUrl;
        private readonly string _apiKey;

        // Stop words to exclude from keywords
        private static readonly HashSet<string> StopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            // Articles
            "a", "an", "the",
            // Conjunctions
            "and", "or", "but", "nor",
            // Prepositions
            "in", "on", "at", "by", "for", "with", "from", "to", "of", "about", "as", "into", "through", "over", "under",
            // Pronouns
            "it", "its", "this", "that", "these", "those",
            // Common verbs/auxiliaries
            "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
            // Other common words
            "not", "can", "will", "if", "than", "then", "so", "just", "only"
        };

        public VolusionClient(HttpClient httpClient, ILogger<VolusionClient> logger, Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _httpClient = httpClient;
            _logger = logger;
            _apiKey = $"Login={configuration["VOLUSION_API_LOGIN"]}&EncryptedPassword={configuration["VOLUSION_API_PW"]}";
            _apiUrl = string.Concat(configuration["VOLUSION_API_URL"], "?", _apiKey, "&EDI_Name=Generic\\Orders&SELECT_Columns=o.OrderID,o.CustomerID,o.Order_Comments,o.OrderDate,od.ProductCode,od.ProductID,od.ProductName,od.Options");

            // Volusion requires specific headers
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "curl/8.14.1");
            _httpClient.DefaultRequestHeaders.Add("Accept", "application/xml");
        }

        public async Task<OrderMeta> GetOrderAsync(string orderNumber)
        {
            // Rate limiting: 100 requests per 15 seconds = ~6.6 req/sec.
            // We'll be conservative and limit to ~5 req/sec (200ms delay).
            // Since the Worker processes orders sequentially, this simple delay is sufficient.
            await Task.Delay(200);

            try
            {
                // Construct URL with encrypted key
                var url = $"{_apiUrl}&WHERE_Column=o.OrderID&WHERE_Value={orderNumber}"; 
                
                var response = await _httpClient.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Volusion API Error for Order {OrderNumber}. Status: {StatusCode}. Response: {ResponseContent}", orderNumber, response.StatusCode, content);
                    return null;
                }

                XDocument doc;
                try
                {
                    doc = XDocument.Parse(content);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to parse XML for Order {OrderNumber}. Content: {ResponseContent}", orderNumber, content);
                    return null;
                }
                
                var orderElements = doc.Descendants("Orders").ToList();
                if (!orderElements.Any()) return null;

                var firstElement = orderElements.First();
                var meta = new OrderMeta
                {
                    OrderNumber = orderNumber,
                    OrderDate = DateTime.Parse(firstElement.Element("OrderDate")?.Value ?? DateTime.UtcNow.ToString()),
                    CustomerId = firstElement.Element("CustomerID")?.Value,
                    OrderComments = firstElement.Element("Order_Comments")?.Value,
                    LastIndexedUtc = DateTime.UtcNow
                };

                var productNames = new List<string>();
                var productCodes = new List<string>();
                var productIds = new List<string>();

                foreach (var orderElement in orderElements)
                {
                    var orderDetails = orderElement.Element("OrderDetails");
                    if (orderDetails != null)
                    {
                        var pId = orderDetails.Element("ProductID")?.Value;
                        var pCode = orderDetails.Element("ProductCode")?.Value;
                        var pName = orderDetails.Element("ProductName")?.Value;

                        // Fallback if ProductName is missing but ProductCode exists
                        if (string.IsNullOrEmpty(pName) && !string.IsNullOrEmpty(pCode))
                        {
                            pName = pCode;
                        }

                        if (!string.IsNullOrEmpty(pId)) productIds.Add(pId);
                        if (!string.IsNullOrEmpty(pCode)) productCodes.Add(pCode);
                        if (!string.IsNullOrEmpty(pName)) productNames.Add(pName);

                        var optionsStr = orderDetails.Element("Options")?.Value;
                        if (!string.IsNullOrEmpty(optionsStr))
                        {
                            var newOptions = ParseOptions(optionsStr);
                            meta.Options.AddRange(newOptions);
                        }
                    }
                }

                meta.ProductId = string.Join(", ", productIds.Distinct());
                meta.ProductCode = string.Join(", ", productCodes.Distinct());
                meta.ProductName = string.Join(", ", productNames.Distinct());

                // Keywords generation
                meta.Keywords = GenerateKeywords(meta);
                
                // Determine if Custom Order based on Name or Code
                bool isCustomName = meta.ProductName?.StartsWith("Custom", StringComparison.OrdinalIgnoreCase) ?? false;
                
                var customCodeKeywords = new[] { "cust", "cst", "custom" };
                bool isCustomCode = false;
                if (!string.IsNullOrEmpty(meta.ProductCode))
                {
                    isCustomCode = customCodeKeywords.Any(k => meta.ProductCode.Contains(k, StringComparison.OrdinalIgnoreCase)) 
                                   || meta.ProductCode.Contains("_");
                }

                if (isCustomName || isCustomCode)
                {
                    meta.IsCustom = true; 
                }

                return meta;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching order {OrderNumber}", orderNumber);
                return null;
            }
        }

        private List<ProductOption> ParseOptions(string optionsStr)
        {
            var options = new List<ProductOption>();
            // Format: [Key:Value][Key2:Value2]
            var parts = optionsStr.Split(new[] { '[', ']' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var kvp = part.Split(new[] { ':' }, 2);
                if (kvp.Length == 2)
                {
                    options.Add(new ProductOption { Key = kvp[0].Trim(), Value = kvp[1].Trim() });
                }
            }
            return options;
        }

        private List<string> GenerateKeywords(OrderMeta meta)
        {
            var keywords = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            if (!string.IsNullOrEmpty(meta.ProductName))
            {
                var tokens = meta.ProductName.Split(new[] { ' ', '-', '"', '\'', ',' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var token in tokens)
                {
                    // Filter single characters and stop words
                    if (token.Length > 1 && !StopWords.Contains(token))
                    {
                        keywords.Add(token);
                    }
                }
            }

            foreach (var opt in meta.Options)
            {
                // Add the full value if it's substantial and not a stop word
                if (opt.Value.Length > 1 && !StopWords.Contains(opt.Value))
                {
                    keywords.Add(opt.Value);
                }

                // Also add parts of the value
                var tokens = opt.Value.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var token in tokens)
                {
                    // Filter single characters and stop words
                    if (token.Length > 1 && !StopWords.Contains(token))
                    {
                        keywords.Add(token);
                    }
                }
            }

            return keywords.ToList();
        }
    }
}
