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

        private DateTime _lastScheduledRun = DateTime.MinValue;

        public Worker(ILogger<Worker> logger, VolusionClient volusionClient, MeiliSearchService meiliSearchService, IConfiguration configuration)
        {
            _logger = logger;
            _volusionClient = volusionClient;
            _meiliSearchService = meiliSearchService;
            _configuration = configuration;

        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Worker started at: {time}", DateTimeOffset.Now);

            // Initialize Meilisearch index
            await _meiliSearchService.InitializeAsync();

            // Trigger incremental index on startup
            bool isFirstRun = true;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var reindexTriggerPath = Path.Combine(OrdersPath, "reindex.trigger");
                    var incrementalTriggerPath = Path.Combine(OrdersPath, "incremental.trigger");
                    var reindexStatusPath = Path.Combine(OrdersPath, "reindex.status.json");
                    
                    // Check for manual full reindex trigger
                    bool fullReindexTrigger = File.Exists(reindexTriggerPath);
                    
                    // Check for manual incremental trigger
                    bool manualIncrementalTrigger = File.Exists(incrementalTriggerPath);
                    
                    // Check if it's time for scheduled incremental run (4 AM daily)
                    bool scheduledIncrementalTrigger = ShouldRunScheduledIndex();
                    
                    // Trigger incremental on first run
                    bool startupIncrementalTrigger = isFirstRun;
                    
                    if (fullReindexTrigger)
                    {
                        _logger.LogInformation("Manual full reindex triggered. Starting scan of orders directory: {Path}", OrdersPath);
                        
                        if (Directory.Exists(OrdersPath))
                        {
                            await ProcessReindexAsync(reindexTriggerPath, reindexStatusPath, stoppingToken, isFull: true);
                        }
                        else
                        {
                            _logger.LogWarning("Orders directory not found: {Path}", OrdersPath);
                        }
                    }
                    else if (manualIncrementalTrigger || scheduledIncrementalTrigger || startupIncrementalTrigger)
                    {
                        var triggerType = startupIncrementalTrigger ? "Startup" : 
                                         manualIncrementalTrigger ? "Manual" : "Scheduled";
                        _logger.LogInformation("{TriggerType} incremental index triggered. Starting scan of orders directory: {Path}", triggerType, OrdersPath);
                        
                        if (Directory.Exists(OrdersPath))
                        {
                            await ProcessIncrementalIndexAsync(incrementalTriggerPath, reindexStatusPath, stoppingToken);
                        }
                        else
                        {
                            _logger.LogWarning("Orders directory not found: {Path}", OrdersPath);
                        }
                        
                        // Update last scheduled run time
                        if (scheduledIncrementalTrigger)
                        {
                            _lastScheduledRun = DateTime.Now;
                        }
                        
                        // Clear first run flag
                        isFirstRun = false;
                    }
                    else if (isFirstRun)
                    {
                        // Just clear the flag if directory doesn't exist
                        isFirstRun = false;
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

                // Check frequently for manual triggers (every 1 second)
                // but only run scheduled scans once daily at 4 AM
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
        }

        private bool ShouldRunScheduledIndex()
        {
            // Use local container time instead of UTC
            var now = DateTime.Now;
            
            // Get target hour from CRON_SCHEDULE or default to 4 AM
            // Expected format: "0 4 * * *" (minute hour day month day-of-week)
            var targetHour = 4;
            var cronSchedule = _configuration["CRON_SCHEDULE"];
            
            if (!string.IsNullOrEmpty(cronSchedule))
            {
                var parts = cronSchedule.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2 && int.TryParse(parts[1], out int parsedHour))
                {
                    targetHour = parsedHour;
                }
                else
                {
                    _logger.LogWarning("Invalid CRON_SCHEDULE format '{Schedule}'. using default 4 AM.", cronSchedule);
                }
            }
            
            // Calculate today's target time
            var todayTarget = now.Date.AddHours(targetHour);
            
            // If current time is past today's target time and we haven't run since then
            if (now >= todayTarget && _lastScheduledRun < todayTarget)
            {
                return true;
            }
            
            return false;
        }

        private async Task ProcessReindexAsync(string reindexTriggerPath, string reindexStatusPath, CancellationToken stoppingToken, bool isFull)
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
                LastCompletedRun = GetLastCompletedRun(reindexStatusPath),
                ReindexType = isFull ? "full" : "incremental"
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
                    // Check if photos exist (logic kept just in case but property removed)
                    // var photoFiles = Directory.GetFiles(dir, "*.*") ...

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
                    var jsonOptions = new JsonSerializerOptions 
                    { 
                        WriteIndented = true, 
                        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                    };
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

        private async Task ProcessIncrementalIndexAsync(string incrementalTriggerPath, string reindexStatusPath, CancellationToken stoppingToken)
        {
            var directories = Directory.GetDirectories(OrdersPath);
            var orderDirectories = directories.Where(dir => int.TryParse(Path.GetFileName(dir), out _)).ToList();
            
            // Filter to only new orders (missing order.meta.json) or orders with corrupted files
            var newOrders = new List<string>();
            var corruptedOrders = new List<string>();
            
            foreach (var dir in orderDirectories)
            {
                var metaPath = Path.Combine(dir, "order.meta.json");
                if (!File.Exists(metaPath))
                {
                    newOrders.Add(dir);
                }
                else
                {
                    // Check if file is corrupted by trying to deserialize it
                    try
                    {
                        var existingJson = await File.ReadAllTextAsync(metaPath, stoppingToken);
                        JsonSerializer.Deserialize<OrderMeta>(existingJson);
                    }
                    catch
                    {
                        // File exists but is corrupted
                        corruptedOrders.Add(dir);
                        _logger.LogWarning("Detected corrupted order.meta.json for order {OrderNumber}", Path.GetFileName(dir));
                    }
                }
            }
            
            var ordersToProcess = newOrders.Concat(corruptedOrders).ToList();
            var totalOrders = ordersToProcess.Count;
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
                LastCompletedRun = GetLastCompletedRun(reindexStatusPath),
                ReindexType = "incremental"
            };
            await WriteStatusAsync(reindexStatusPath, initialStatus);

            _logger.LogInformation("Incremental index: Found {NewCount} new orders and {CorruptedCount} corrupted orders to process (Total: {TotalCount})", 
                newOrders.Count, corruptedOrders.Count, totalOrders);

            foreach (var dir in ordersToProcess)
            {
                if (stoppingToken.IsCancellationRequested) break;

                var dirName = Path.GetFileName(dir);
                var metaPath = Path.Combine(dir, "order.meta.json");
                
                _logger.LogInformation("Processing new order: {OrderNumber}", dirName);
                
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
                    LastCompletedRun = GetLastCompletedRun(reindexStatusPath),
                    ReindexType = "incremental"
                };
                await WriteStatusAsync(reindexStatusPath, currentStatus);

                var orderMeta = await _volusionClient.GetOrderAsync(dirName);
                
                if (orderMeta != null)
                {
                    // Check if photos exist (logic kept just in case but property removed)
                    // var photoFiles = Directory.GetFiles(dir, "*.*") ...

                    // Handle NeedsReview Logic for new/corrupted orders
                    bool isCorrupted = corruptedOrders.Contains(dir);
                    bool missingComments = string.IsNullOrWhiteSpace(orderMeta.OrderComments);
                    bool newCustom = orderMeta.IsCustom;
                    bool newDataQualityIssue = orderMeta.IsCustom && missingComments;
                    
                    // Flag for review if: (1) corrupted file, (2) new custom order, or (3) data quality issue
                    orderMeta.NeedsReview = isCorrupted || newCustom || newDataQualityIssue;

                    // Write JSON
                    var jsonOptions = new JsonSerializerOptions 
                    { 
                        WriteIndented = true, 
                        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                    };
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
                LastCompletedRun = DateTime.UtcNow,
                ReindexType = "incremental"
            };
            await WriteStatusAsync(reindexStatusPath, completedStatus);
            
            _logger.LogInformation("Incremental index complete. Processed {Count} new orders. Removing trigger file if exists.", processedCount);
            
            // Remove trigger file if it exists
            if (File.Exists(incrementalTriggerPath))
            {
                File.Delete(incrementalTriggerPath);
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
