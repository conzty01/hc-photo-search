using System;

namespace HcPhotoSearch.Shared
{
    public class ReindexStatus
    {
        public bool IsRunning { get; set; }
        public DateTime? StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public int ProcessedOrders { get; set; }
        public int TotalOrders { get; set; }
        public string? CurrentOrder { get; set; }
        public string? Error { get; set; }
        public DateTime? LastCompletedRun { get; set; }
    }
}
