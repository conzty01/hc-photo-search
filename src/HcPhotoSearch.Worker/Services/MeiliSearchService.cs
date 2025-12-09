using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using HcPhotoSearch.Shared;
using Meilisearch;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace HcPhotoSearch.Worker.Services
{
    public class MeiliSearchService
    {
        private readonly MeilisearchClient _client;
        private readonly ILogger<MeiliSearchService> _logger;
        private const string IndexName = "orders";

        public MeiliSearchService(IConfiguration configuration, ILogger<MeiliSearchService> logger)
        {
            _logger = logger;
            var url = configuration["MEILISEARCH_URL"] ?? "http://localhost:7700";
            var key = configuration["MEILISEARCH_MASTER_KEY"];
            _client = new MeilisearchClient(url, key);
        }

        public async Task InitializeAsync()
        {
            try
            {
                var index = _client.Index(IndexName);
                // Ensure index exists or create it
                // Meilisearch creates index on first document add, but we might want to configure settings first.
                // Checking if index exists is tricky without try-catch in older versions, but let's try to get it.
                
                // We'll just configure settings. If index doesn't exist, this might fail or create it?
                // Best practice: Create if not exists.
                
                // Simple check:
                try 
                {
                    await _client.GetIndexAsync(IndexName);
                }
                catch (MeilisearchApiError)
                {
                    await _client.CreateIndexAsync(IndexName, "orderNumber");
                }

                var indexObj = _client.Index(IndexName);

                // Update settings
                await indexObj.UpdateSearchableAttributesAsync(new[] { "keywords", "productName", "options.value", "orderNumber", "orderComments" });
                await indexObj.UpdateFilterableAttributesAsync(new[] { "isCustom", "needsReview", "keywords", "options.key", "options.value" });
                await indexObj.UpdateSortableAttributesAsync(new[] { "lastIndexedUtc", "orderDate" });
                await indexObj.UpdateRankingRulesAsync(new[] 
                { 
                    "words", 
                    "typo", 
                    "proximity", 
                    "attribute", 
                    "sort", 
                    "exactness" 
                });
                
                _logger.LogInformation("Meilisearch index initialized.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize Meilisearch index.");
            }
        }

        public async Task UpsertOrderAsync(OrderMeta order)
        {
            try
            {
                var index = _client.Index(IndexName);
                await index.UpdateDocumentsAsync(new[] { order });
                _logger.LogInformation("Upserted order {OrderNumber} to Meilisearch.", order.OrderNumber);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upsert order {OrderNumber}.", order.OrderNumber);
            }
        }
    }
}
