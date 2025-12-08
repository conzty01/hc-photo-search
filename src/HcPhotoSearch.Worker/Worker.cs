using System.Text.Json;
using HcPhotoSearch.Shared;
using HcPhotoSearch.Worker.Services;

namespace HcPhotoSearch.Worker
{
    public class Worker : BackgroundService
    {
        private readonly ILogger<Worker> _logger;
        private readonly VolusionClient _volusionClient;
        private readonly MeiliSearchService _meiliSearchService;
        private readonly IConfiguration _configuration;
        private const string OrdersPath = "/mnt/orders"; // Docker internal mount path
        private readonly string _ordersDisplayPath; // Windows-accessible path for photoPath field
        private DateTime _lastScheduledRun = DateTime.MinValue;

        public Worker(ILogger<Worker> logger, VolusionClient volusionClient, MeiliSearchService meiliSearchService, IConfiguration configuration)
        {
            _logger = logger;
            _volusionClient = volusionClient;
            _meiliSearchService = meiliSearchService;
            _configuration = configuration;
            _ordersDisplayPath = _configuration["ORDERS_PATH"] ?? OrdersPath;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Worker started at: {time}", DateTimeOffset.Now);

            // Initialize Meilisearch index
            await _meiliSearchService.InitializeAsync();

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var reindexTriggerPath = Path.Combine(OrdersPath, "reindex.trigger");
                    var reindexStatusPath = Path.Combine(OrdersPath, "reindex.status.json");
                    
                    // Check if manual trigger exists
                    bool manualTrigger = File.Exists(reindexTriggerPath);
                    
                    // Check if it's time for scheduled run (4 AM daily)
                    bool scheduledTrigger = ShouldRunScheduledIndex();
                    
                    if (manualTrigger || scheduledTrigger)
                    {
                        var triggerType = manualTrigger ? "Manual" : "Scheduled";
                        _logger.LogInformation("{TriggerType} reindex triggered. Starting scan of orders directory: {Path}", triggerType, OrdersPath);
                        
                        if (Directory.Exists(OrdersPath))
                        {
                            await ProcessReindexAsync(reindexTriggerPath, reindexStatusPath, stoppingToken);
                        }
                        else
                        {
                            _logger.LogWarning("Orders directory not found: {Path}", OrdersPath);
                        }
                        
                        // Update last scheduled run time
                        if (scheduledTrigger)
                        {
                            _lastScheduledRun = DateTime.UtcNow;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during worker execution");
                    
                    // Write error status if we were doing a reindex
                    try
                    {
                        var reindexStatusPath = Path.Combine(OrdersPath, "reindex.status.json");
                        var errorStatus = await ReadStatusAsync(reindexStatusPath);
                        if (errorStatus?.IsRunning == true)
                        {
                            errorStatus.IsRunning = false;
                            errorStatus.EndTime = DateTime.UtcNow;
                            errorStatus.Error = ex.Message;
                            await WriteStatusAsync(reindexStatusPath, errorStatus);
                        }
                    }
                    catch
                    {
                        // Ignore errors writing error status
                    }
                }

                // Check frequently for manual triggers (every 10 seconds)
                // but only run scheduled scans once daily at 4 AM
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }

        private bool ShouldRunScheduledIndex()
        {
            var now = DateTime.UtcNow;
            
            // If we've never run, don't auto-trigger (wait for manual trigger or next 4 AM)
            if (_lastScheduledRun == DateTime.MinValue)
            {
                return false;
            }
            
            // Check if it's past 4 AM UTC (or configured time) and we haven't run today
            // For now, using 4 AM UTC. This can be made configurable later.
            var targetHour = 4;
            
            // Calculate the last 4 AM
            var todayTarget = now.Date.AddHours(targetHour);
            var yesterdayTarget = todayTarget.AddDays(-1);
            
            // If current time is past today's 4 AM and we haven't run since yesterday's 4 AM
            if (now >= todayTarget && _lastScheduledRun < todayTarget)
            {
                return true;
            }
            
            return false;
        }

        private async Task ProcessReindexAsync(string reindexTriggerPath, string reindexStatusPath, CancellationToken stoppingToken)
        {
            var directories = Directory.GetDirectories(OrdersPath);
            var orderDirectories = directories.Where(dir => int.TryParse(Path.GetFileName(dir), out _)).ToList();
            var totalOrders = orderDirectories.Count;
            var processedCount = 0;

            // Initialize status
            var initialStatus = new ReindexStatus
            {
                IsRunning = true,
                StartTime = DateTime.UtcNow,
                EndTime = null,
                ProcessedOrders = 0,
                TotalOrders = totalOrders,
                CurrentOrder = null,
                Error = null,
                LastCompletedRun = GetLastCompletedRun(reindexStatusPath)
            };
            await WriteStatusAsync(reindexStatusPath, initialStatus);

            foreach (var dir in orderDirectories)
            {
                if (stoppingToken.IsCancellationRequested) break;

                var dirName = Path.GetFileName(dir);
                var metaPath = Path.Combine(dir, "order.meta.json");
                
                // Always process in a full reindex
                _logger.LogInformation("Processing order: {OrderNumber}", dirName);
                
                // Update status with current order
                var currentStatus = new ReindexStatus
                {
                    IsRunning = true,
                    StartTime = (await ReadStatusAsync(reindexStatusPath))?.StartTime ?? DateTime.UtcNow,
                    EndTime = null,
                    ProcessedOrders = processedCount,
                    TotalOrders = totalOrders,
                    CurrentOrder = dirName,
                    Error = null,
                    LastCompletedRun = GetLastCompletedRun(reindexStatusPath)
                };
                await WriteStatusAsync(reindexStatusPath, currentStatus);

                var orderMeta = await _volusionClient.GetOrderAsync(dirName);
                
                if (orderMeta != null)
                {
                    orderMeta.PhotoPath = Path.Combine(_ordersDisplayPath, dirName);
                    
                    // Check if photos exist
                    var photoFiles = Directory.GetFiles(dir, "*.*")
                        .Where(f => !f.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                        .ToList();
                    orderMeta.HasPhotos = photoFiles.Count > 0;

                    // Handle NeedsReview Logic
                    bool isNew = !File.Exists(metaPath);
                    OrderMeta? existingMeta = null;
                     if (!isNew)
                    {
                        try 
                        {
                            var existingJson = await File.ReadAllTextAsync(metaPath, stoppingToken);
                            existingMeta = JsonSerializer.Deserialize<OrderMeta>(existingJson);
                        }
                        catch { /* Ignore read errors */ }
                    }

                    bool missingComments = string.IsNullOrWhiteSpace(orderMeta.OrderComments);
                    
                    // Logic:
                    // 1. If user manually set it (previousState), respect that (don't override)  
                    // 2. If NEW and Custom -> Flag it
                    // 3. If NEW, Custom, and Missing Comments -> Flag it (Data quality issue)
                    // Once user has reviewed and cleared flag, don't re-flag on subsequent reindexes
                    
                    bool previousState = existingMeta?.NeedsReview ?? false;
                    bool newCustom = isNew && orderMeta.IsCustom;
                    bool newDataQualityIssue = isNew && orderMeta.IsCustom && missingComments;

                    // If it existed before, respect the user's choice
                    // Only auto-flag if it's a new order
                    if (isNew)
                    {
                        orderMeta.NeedsReview = newCustom || newDataQualityIssue;
                    }
                    else
                    {
                        orderMeta.NeedsReview = previousState;
                    }

                    // Write JSON
                    var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
                    var jsonString = JsonSerializer.Serialize(orderMeta, jsonOptions);
                    await File.WriteAllTextAsync(metaPath, jsonString, stoppingToken);

                    // Upsert to Meilisearch
                    await _meiliSearchService.UpsertOrderAsync(orderMeta);
                    
                    processedCount++;
                }
                else
                {
                    _logger.LogWarning("Failed to fetch metadata for order {OrderNumber}", dirName);
                }
            }

            // Complete status
            var completedStatus = new ReindexStatus
            {
                IsRunning = false,
                StartTime = (await ReadStatusAsync(reindexStatusPath))?.StartTime ?? DateTime.UtcNow,
                EndTime = DateTime.UtcNow,
                ProcessedOrders = processedCount,
                TotalOrders = totalOrders,
                CurrentOrder = null,
                Error = null,
                LastCompletedRun = DateTime.UtcNow
            };
            await WriteStatusAsync(reindexStatusPath, completedStatus);
            
            _logger.LogInformation("Reindex complete. Processed {Count} orders. Removing trigger file if exists.", processedCount);
            
            // Remove trigger file if it exists
            if (File.Exists(reindexTriggerPath))
            {
                File.Delete(reindexTriggerPath);
            }
        }

        private async Task WriteStatusAsync(string statusPath, ReindexStatus status)
        {
            try
            {
                var jsonOptions = new JsonSerializerOptions { WriteIndented = true };
                var jsonString = JsonSerializer.Serialize(status, jsonOptions);
                await File.WriteAllTextAsync(statusPath, jsonString);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to write reindex status file");
            }
        }

        private async Task<ReindexStatus?> ReadStatusAsync(string statusPath)
        {
            try
            {
                if (File.Exists(statusPath))
                {
                    var jsonString = await File.ReadAllTextAsync(statusPath);
                    return JsonSerializer.Deserialize<ReindexStatus>(jsonString);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read reindex status file");
            }
            return null;
        }

        private DateTime? GetLastCompletedRun(string statusPath)
        {
            try
            {
                if (File.Exists(statusPath))
                {
                    var status = ReadStatusAsync(statusPath).GetAwaiter().GetResult();
                    return status?.LastCompletedRun;
                }
            }
            catch
            {
                // Ignore errors
            }
            return null;
        }
    }
}
