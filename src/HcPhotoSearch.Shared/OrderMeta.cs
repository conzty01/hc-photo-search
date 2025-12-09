using System;
using System.Collections.Generic;

namespace HcPhotoSearch.Shared
{
    public class OrderMeta
    {
        public string Version { get; set; } = "v1";
        public string OrderNumber { get; set; }
        public DateTime OrderDate { get; set; }
        public string CustomerId { get; set; }
        public string OrderComments { get; set; }

        [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
        public string? PhotoPath { get; set; }
        public string OrderUrl { get; set; }
        public string ProductName { get; set; }
        public string ProductId { get; set; }
        public string ProductCode { get; set; }
        public List<ProductOption> Options { get; set; } = new List<ProductOption>();
        public List<string> Keywords { get; set; } = new List<string>();
        public bool IsCustom { get; set; }
        public bool NeedsReview { get; set; }

        public DateTime LastIndexedUtc { get; set; }
    }

    public class ProductOption
    {
        public string Key { get; set; }
        public string Value { get; set; }
    }
}
