# Ingestion Pipeline

## Nightly CRON Job (Incremental Sync)
The nightly worker runs automatically to keep the search index up-to-date with new orders:

- **Trigger**: Scheduled check (4:00 AM local time daily) in worker container.
- **Scope**: Incremental processing only — scans for new orders or corrupted metadata.
- **Workflow**:
  1. **Scan orders directory**: Enumerate all subdirectories in mounted NAS orders path.
  2. **Filter new/corrupted orders**:
     - Check if `order.meta.json` is missing (New).
     - Check if `order.meta.json` is unreadable (Corrupted).
  3. **Fetch metadata from ecommerce API** (see section 7.2).
  4. **Generate JSON metadata** (see section 7.3).
  5. **Upsert to Meilisearch** (see section 7.4).
  6. **Log results**: Record number of orders processed, errors encountered, execution time.
  7. **Send Discord notification** (optional): Summary of nightly run (e.g., "Processed 12 new orders, 0 errors").

## Ecommerce API Integration (Volusion)
- **Authentication**: Encrypted query parameter passed with each API request.
- **Endpoint**: Volusion API order details endpoint (exact URL configured via `VOLUSION_API_URL` env var).
- **Request strategy**:
  - **Individual fetching**: Request each order in a single API call.
- **Data extraction**:
  - **Format**: API returns XML.
  - Order number (validate against folder name).
  - Order date
  - Customer ID
  - Order Comments
  - Order Details
    - Product Name
    - Product ID
    - Product name
    - Product options (size, wood type, finish, etc.) - stored as bracketed string `[Key:Value]`.
    - Product slug/handle (for constructing product URL)
    - Custom order flag (if available in API response)
- **Error handling**:
  - **API unavailable** (network error, timeout): Log error, stop processing, send Discord alert.
  - **Order not found in API**: Log warning, flag order for manual review, continue processing remaining orders.
  - **Malformed API response**: Log error with order number, skip order, continue processing.

## Metadata Generation
For each order, construct the `order.meta.json` file:

- **Photo detection**:
  - Scan order folder for `.jpg` and `.png` files.
  - If at least one image file exists → set `hasPhotos: true` (or equivalent flag).
  - Note: Typically includes order summary image + product photos.
- **Custom order detection**: Flag for manual review if order description unavailable from API and is a custom order.
- **Keyword generation**:
  - Tokenize product name (split on spaces, punctuation, quotes, hyphens).
  - Filter out stop words (e.g., "and", "an", "the").
  - Extract option values (parse `[Key:Value]` format from XML).
  - Apply synonym mapping (e.g., 42\" chest → medium chest) from config file.
  - Preserve raw size strings for exact matching.
  - Combine all tokens into deduplicated keywords array.
- **Order URL construction**:
  - If order number available from API → construct full order URL.
  - Format: `https://www.harmonycedar.com/admin/AdminDetails_ProcessOrder.asp?table=Orders&Page=1&ID={orderNumber}`.
  - If order number unavailable → leave `ecommerceOrderUrl` as empty string or null.
- **UNC path construction**:
  - Build Windows UNC path using configurable base path.
  - Configured via `ORDERS_DISPLAY_PATH` env var (e.g. `X:\Orders` vs `\\nas\photos\orders`).
  - Store in `photoPath` field for desktop clipboard copy functionality.
- **Timestamp**: Set `lastIndexedUtc` to current UTC timestamp.

## Persistence and Meilisearch Upsertion
- **Write JSON file**:
  - Write/overwrite `order.meta.json` in the order's folder.
  - Use atomic write (write to temp file, then rename) to prevent corruption.
  - Validate JSON structure before writing.
- **Upsert to Meilisearch**:
  - Connect to Meilisearch instance via `MEILISEARCH_URL` and `MEILISEARCH_MASTER_KEY`.
  - Use `orders` index (create if doesn't exist on first run).
  - Upsert document using order number as primary key (updates existing or inserts new).
  - Configure index settings (if not already set):
    - **Searchable attributes**: `keywords`, `productName`, `options.value`.
    - **Filterable attributes**: `isCustom`, `hasPhotos`.
    - **Sortable attributes**: `lastIndexedUtc`.
    - **Ranking rules**: Exact keyword hits > option hits > description hits.
    - **Typo tolerance**: Enabled (e.g., ceder → cedar).
  - Batch upsert if processing multiple orders (more efficient than individual upserts).
- **Error handling**:
  - **Meilisearch unavailable**: Log error, stop processing, send Discord alert.
  - **Index operation fails**: Log error with order number, continue processing remaining orders.
  - **Corrupted existing JSON**: Regenerate from API data, log warning.

## Full Reindex Operation
Separate from the nightly CRON job, triggered manually via API endpoint:

- **Trigger**: Admin calls `/admin/reindex?full=true` endpoint.
- **Purpose**: Reprocess all orders in the directory (e.g., after schema updates, synonym changes, or data corruption).
- **Workflow**:
  1. **Scan all orders**: Enumerate all subdirectories in orders path (no filtering).
  2. **Process every order**: Fetch API data, regenerate JSON, upsert to Meilisearch.
  3. **Ignore timestamps**: Reprocess regardless of `lastIndexedUtc` value.
  4. **Clear stale entries** (optional): Remove Meilisearch documents for orders no longer in filesystem.
- **Execution**: Runs synchronously or as background job (return job ID to caller).
- **Logging**: Detailed progress log (e.g., "Processing order 1234/5000...").
- **Notification**: Discord alert when complete with summary (total processed, errors, duration).
- **Note**: This is NOT part of the nightly CRON worker — it's a separate on-demand operation.

## Error Handling and Monitoring
- **Logging**:
  - All operations logged with timestamps to persistent volume (`/app/logs/ingestion.log`).
  - Log levels: INFO (normal operations), WARN (recoverable errors), ERROR (critical failures).
  - Include order number, operation type, error details in all log entries.
- **Discord notifications**:
  - **Nightly job completion**: Summary message (orders processed, errors, duration).
  - **Critical errors**: Immediate alert for API unavailability, Meilisearch failures.
  - **Manual reindex completion**: Summary of full reindex operation.
- **Retry logic**:
  - **Transient API errors**: Retry up to 3 times with exponential backoff.
  - **Meilisearch connection errors**: Retry up to 3 times with exponential backoff.
  - **Persistent failures**: Log error, send Discord alert, continue processing remaining orders.

## Mobile Photo Upload (Manual Ingestion)
- **Purpose**: Allow users to upload order photos directly from mobile devices immediately after finishing a piece.
- **Workflow**:
  1. User navigates to `/upload` page (linked from Search header).
  2. Enters **Order Number**.
  3. Selects multiple photos from device gallery or camera.
  4. **Frontend**: Sends `POST /upload-photos` with `multipart/form-data`.
  5. **Backend**:
     - Validates order number.
     - Creates order directory if it doesn't exist (supporting new orders).
     - Saves files with timestamp-suffixed names (e.g., `IMG_1234_20251201120000.jpg`) to prevent collisions.
     - Triggers **incremental index** (`incremental.trigger`) to make photos immediately searchable.
  6. **Completion**: User sees success message and stays on page to upload more if needed.
