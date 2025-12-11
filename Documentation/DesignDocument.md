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
See [UI Requirements](UIRequirements.md) for detailed UI specifications.

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
See [Ingestion Pipeline](IngestionPipeline.md) for detailed pipeline specifications.

## 8. Search Requirements
- Free-text search only (no filters in UI).
- Fuzzy matching: Typo tolerance (e.g., ceder → cedar).
- Tokenization: Split on punctuation, quotes, hyphens.
- Ranking: Exact keyword hits > option hits > description hits.
- Boost: Orders with photos present.

---

## 9. Deployment
See [Production Deployment Guide](ProductionSetup.md) for detailed deployment instructions, including Docker Compose configuration and environment variables.
