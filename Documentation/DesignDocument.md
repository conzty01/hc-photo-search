# Design Requirements Document  
**Project:** Customer Order Photo Search Portal    
**Date:** December 2025  
**Version:** v1.1  

---

## 1. Project Overview
The goal is to build a **mobile-friendly web portal** that allows searching for customer order photos by keywords (e.g., product type, size, wood type, finish).  
- Current state: Photos are stored in NAS subdirectories named by order number.  
- Problem: No easy way to search by product attributes; manual lookup is inefficient.  
- Solution: Create a metadata layer (JSON per order folder) and index it with a search backend (Meilisearch).  

---

## 2. High-Level Architecture
- **Frontend:** React + TypeScript (mobile-first design).  
- **Backend:** ASP.NET Core Minimal API.  
- **Search Engine:** Meilisearch (Dockerized).  
- **Data Layer:** JSON metadata files stored in each order's photo directory.  
- **Ingestion:** Nightly batch job to sync ecommerce API data → JSON → Meilisearch index.  
- **Deployment:** Docker Compose on NAS (frontend, backend, search, ingestion worker).  
- **Access:** LAN/VPN only, no authentication required.  

---

## 3. UI Requirements
- **Search/Home Page**:
  - Central, full‑width search box with auto‑focus, supporting free‑text and fuzzy matching.
  - Mobile‑first responsive layout with dark‑mode support (theme toggle shows sun/moon icon).
  - Results list displays:
    - Order number, product name, selected options.
    - Badges (e.g., `Custom`).
    - “Copy Path” button that copies a Windows UNC path (`\\nas\\photos\\orders\\12345`) to clipboard.
    - “Edit” button linking to `/admin/orders/{id}` for JSON slug editing.
  - Header toolbar with quick‑access icons:
    - Upload (navigates to `/upload`).
    - Admin (navigates to `/admin`).
- **Admin Page**:
  - Primary actions: Full reindex, Incremental sync (new & corrupted orders), Order management, Settings.
  - Reindex button styled as secondary to distinguish from “Save Changes”.
  - Incremental sync button highlighted for frequent use.
- **Upload Page**:
  - Order number input + multi‑file selector.
  - “Upload Photos” button uses unified admin‑style class for consistent height and visual prominence.
  - Real‑time success/error toast notifications.
  - Page remains after upload to allow batch uploads.

  - Single, prominent search box (free‑text) centered at the top.
  - Mobile‑first responsive layout.
  - Results list displays:
    - Order number.
    - Product name.
    - Product options.
    - Badges (e.g., `Custom`).
    - Copy to clipboard button for Desktop UNC path (`\\nas\photos\orders\12345`).
    - Edit button which will navigate to the `/admin/orders/{id}` page to edit the JSON slug for the associated order.
  - Header includes quick‑access icons:
    - Upload (navigates to `/upload`).
    - Admin (navigates to `/admin`).

- **Admin Page**:
  - Buttons for full reindex, incremental sync, order management, and settings.

- **Upload Page**:
  - Form with order number input and multi‑file selector.
  - Primary “Upload Photos” button uses the unified admin‑style class for height and visual prominence.
  - Inline success and error feedback messages.
  - Remains on the page after upload to allow additional uploads.

---

## 4. Backend Requirements
- **Endpoints:**  
  - `/search?q=...` → proxy to Meilisearch.
  - `/orders/{id}` → return JSON metadata.
  - `/admin/reindex` → trigger full ecosystem reindex (manual).
  - `/admin/incremental` → trigger incremental sync (new/missing only).
  - `/admin/orders` → endpoints for manual order management.
  - `/upload-photos` → endpoint for mobile photo uploads.
- **No authentication** (homelab use only).  

---

## 5. MCP Server (Phase 2)
- **Purpose**: Enable AI assistant access to order search functionality.
- **Primary client**: Claude Desktop (supports MCP natively).
- **Use case**: Marketing material creation - AI can search product photos matching campaign criteria.
- **MCP Tools:**  
  - `orders.search` → query by keyword, returns matching orders with metadata.
  - `orders.get` → retrieve full metadata for specific order number.
- **Implementation**: Thin wrapper around ASP.NET Core API endpoints.
- **Note**: Cloud-based AI services (Gemini web, ChatGPT, etc.) cannot directly connect to local MCP servers. Claude Desktop or local AI agents required.

---

## 6. Data Model (JSON Schema v1)
Each order folder contains `order.meta.json`:

```json
{
  "version": "v1",
  "orderNumber": "11737",
  "orderDate": "2025-12-02T03:52:35Z",
  "customerId": "5616",
  "orderComments": "",
  "photoPath": "\\\\nas\\photos\\orders\\11737",
  "orderUrl": "https://www.harmonycedar.com/admin/AdminDetails_ProcessOrder.asp?table=Orders&Page=1&ID=11737",
  "productName": "Hope Chest — 42\" Maple",
  "productId": "2739",
  "productCode": "CHESTHOPEMAPLE42",
  "options": [
    { "key": "Chest Lock", "value": "Add Lock" },
    { "key": "Wood Finish", "value": "Tuscan Maple" },
    { "key": "Chest Tray", "value": "No Chest Trays" },
    { "key": "Chest Casters", "value": "No Casters" },
    { "key": "Chest Rear Panel", "value": "Standard Cedar Rear Panel" },
    { "key": "Chest Interior", "value": "Standard Cedar Lined Chest" }
  ],
  "keywords": [
    "hope",
    "chest",
    "cedar",
    "42",
    "medium",
    "tuscan",
    "maple",
    "lock"
  ],
  "isCustom": false,
  "lastIndexedUtc": "2025-12-01T03:20:14Z"
}
```

---

## 7. Ingestion Pipeline

### 7.1 Nightly CRON Job (Incremental Sync)
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

### 7.2 Ecommerce API Integration (Volusion)
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

### 7.3 Metadata Generation
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

### 7.4 Persistence and Meilisearch Upsertion
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

### 7.5 Full Reindex Operation
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

### 7.6 Error Handling and Monitoring
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

### 7.7 Mobile Photo Upload (Manual Ingestion)
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

---

## 8. Search Requirements
- Free-text search only (no filters in UI).
- Fuzzy matching: Typo tolerance (e.g., ceder → cedar).
- Tokenization: Split on punctuation, quotes, hyphens.
- Ranking: Exact keyword hits > option hits > description hits.
- Boost: Orders with photos present.

---

## 9. Deployment
- **Docker Compose services:**
  - `frontend` (React + Nginx reverse proxy).
    - Nginx handles routing `/search` and `/admin` requests to the API container.
  - `api` (ASP.NET Core).
  - `search` (Meilisearch).
  - `worker` (nightly ingestion job).

- **Volumes:**
  - NAS orders directory mounted into containers (read-only for API/frontend, read-write for worker).
  - Persistent Meilisearch index data.
  - Logs for ingestion runs.

- **Environment variables:**
  - `VOLUSION_API_URL` - Volusion API endpoint.
  - `VOLUSION_API_KEY` - Encrypted authentication parameter.
  - `DISCORD_WEBHOOK_URL` - For error notifications.
  - `ORDERS_PATH` - Internal Container Path to mounted NAS orders directory (e.g. `/mnt/orders`).
  - `ORDERS_DISPLAY_PATH` - Windows-accessible path for UI copy-paste functionality.
  - `MEILISEARCH_URL` - Internal Meilisearch service URL.
  - `MEILISEARCH_MASTER_KEY` - Meilisearch admin key.

- **Network:** LAN-only, optional reverse proxy with TLS.

---

## 10. Implementation Phases

### Phase 1: Core Application (Priority)
1. Docker Compose infrastructure setup
2. Ingestion worker (Volusion API → JSON → Meilisearch)
3. ASP.NET Core backend API
4. React frontend (mobile-first)
5. Basic search functionality

### Phase 2: MCP Server (Learning Goal)
1. Implement MCP server with `orders.search` and `orders.get` tools
2. Configure Claude Desktop integration
3. Test marketing material workflow
4. Document implementation for portfolio

### Phase 3: Enhancements (Optional)
1. Image preview functionality
2. Advanced synonym/alias system
3. Manual metadata editing UI
4. Mobile photo viewing capability

---

## 12. Decisions Made
- **Search backend**: Meilisearch (Dockerized).
- **Data layer**: JSON metadata files per order folder (canonical source).
- **Frontend**: Mobile-first React + TypeScript UI with free-text search box.
- **Backend**: ASP.NET Core Minimal API with simple endpoints.
- **Ecommerce integration**: Volusion API (XML response) with encrypted query parameter auth.
- **Ingestion**: Nightly incremental sync with full resync option.
- **Deployment**: Docker Compose on NAS with mounted volumes for order directories.
- **Monitoring**: Discord webhook notifications for errors + file-based logging.
- **Photo detection**: Presence of `.jpg`/`.png` files in order folders.
- **MCP server**: Phase 2 implementation for AI assistant integration via Claude Desktop (learning goal + marketing workflow).
- **Authentication**: None required (homelab/LAN use only).
- **Path links**: Optimize for desktop (UNC paths); mobile enhancement deferred.
- **Synonym system**: Start simple (config file), evolve as needed.
- **Reverse Proxy**: Nginx in frontend container routes all API traffic, solving CORS and simplifying config.