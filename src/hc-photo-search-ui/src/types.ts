export interface ProductOption {
    key: string;
    value: string;
}

export interface OrderMeta {
    orderNumber: string;
    orderDate: string;
    customerId: string;
    orderComments: string;
    photoPath: string;
    orderUrl: string;
    productName: string;
    productId: string;
    productCode: string;
    options: ProductOption[];
    keywords: string[];
    isCustom: boolean;
    hasPhotos: boolean;
    lastIndexedUtc: string;
}

export interface SearchResult {
    hits: OrderMeta[];
    estimatedTotalHits: number;
    query: string;
    processingTimeMs: number;
}

export interface ReindexStatus {
    isRunning: boolean;
    startTime: string | null;
    endTime: string | null;
    processedOrders: number;
    totalOrders: number;
    currentOrder: string | null;
    error: string | null;
    lastCompletedRun: string | null;
}
