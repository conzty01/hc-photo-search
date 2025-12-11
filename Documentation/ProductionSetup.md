# Production Deployment Guide (TrueNAS Scale)

This guide explains how to deploy the `hc-photo-search` application on TrueNAS Scale using Docker (or Custom App).

## Prerequisites
1.  **Docker Images**: Ensure the latest images are built and pushed to GitHub Container Registry (GHCR) by the CI pipeline.
    - `ghcr.io/<username>/hc-photo-search-frontend:latest`
    - `ghcr.io/<username>/hc-photo-search-api:latest`
    - `ghcr.io/<username>/hc-photo-search-worker:latest`
    - `getmeili/meilisearch:v1.12`

2.  **Order Storage**: You need a Dataset on TrueNAS where your order photos are stored.
    - Example: `/mnt/pool1/orders`

3.  **Meilisearch Data**: You need a persistent location for the search index. This can be a dedicated Dataset OR a folder within an existing Dataset.
    - Example: `/mnt/pool1/app_data/hc_photo_search/meili_data`

## Docker Compose Configuration

For production, use the following `docker-compose.yml` structure. Replace `<username>` with your GitHub username (lowercase).

```yaml
services:
  frontend:
    image: ghcr.io/<username>/hc-photo-search-frontend:latest
    container_name: frontend
    restart: unless-stopped
    ports:
      - "3000:80" # Maps port 80 inside to 3000 on TrueNAS host
    volumes:
      - ${ORDERS_PATH}:/mnt/orders:ro # Read-only access to photos (optional, frontend doesn't strictly need it but good practice if needed)
    depends_on:
      - api

  api:
    image: ghcr.io/<username>/hc-photo-search-api:latest
    container_name: api
    restart: unless-stopped
    environment:
      - MEILISEARCH_URL=http://search:7700
      - MEILISEARCH_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
      - ASPNETCORE_HTTP_PORTS=8081
      - VOLUSION_API_URL=${VOLUSION_API_URL}
      - VOLUSION_API_LOGIN=${VOLUSION_API_LOGIN}
      - VOLUSION_API_PW=${VOLUSION_API_PW}
      # This path is what Windows users copy. E.g. \\NAS\Orders
      - ORDERS_DISPLAY_PATH=${ORDERS_DISPLAY_PATH}
    volumes:
      # CRITICAL: Maps the host dataset to the container path expected by code
      - ${ORDERS_PATH}:/mnt/orders:rw 
    depends_on:
      - search

  worker:
    image: ghcr.io/<username>/hc-photo-search-worker:latest
    container_name: worker
    restart: unless-stopped
    environment:
      - VOLUSION_API_URL=${VOLUSION_API_URL}
      - VOLUSION_API_LOGIN=${VOLUSION_API_LOGIN}
      - VOLUSION_API_PW=${VOLUSION_API_PW}
      - ORDERS_PATH=/mnt/orders
      - MEILISEARCH_URL=http://search:7700
      - MEILISEARCH_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
      - CRON_SCHEDULE=0 4 * * * # daily at 4am
    volumes:
      - ${ORDERS_PATH}:/mnt/orders:rw # Read-write for creating order.meta.json

  search:
    image: getmeili/meilisearch:v1.12
    container_name: search
    restart: unless-stopped
    environment:
      - MEILI_MASTER_KEY=${MEILISEARCH_MASTER_KEY}
      - MEILI_NO_ANALYTICS=true
    volumes:
      - ${MEILI_DATA_PATH}:/meili_data

# No named volumes needed if using host path mapping for meili_data
```

## Environment Variables
Configure these in your TrueNAS App Environment settings (or `.env` file if using command line Compose):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `MEILISEARCH_MASTER_KEY` | Secure key for Meilisearch | `complex_random_string` |
| `MEILI_DATA_PATH` | Host path for Meilisearch Data | `/mnt/pool1/app_data/meili_data` |
| `VOLUSION_API_URL` | Volusion API Endpoint | `http://www.example.com/net/WebService.aspx` |
| `VOLUSION_API_LOGIN` | API User Email | `api@example.com` |
| `VOLUSION_API_PW` | Encrypted API Password | `EncryptedString...` |
| `ORDERS_PATH` | Host path for Orders (Dataset) | `/mnt/pool1/orders` |
| `ORDERS_DISPLAY_PATH` | Path for "Copy Path" button | `\\NAS\Orders` or `Z:\Orders` |

## Networking Notes
- The **Frontend** service includes an Nginx reverse proxy.
- It automatically forwards requests matching `/search`, `/orders`, `/admin/*`, and `/upload-photos` to `http://api:8081`.
- This requires the API service to be accessible at hostname `api`. In Docker Compose, this is automatic.

## Storage Permission Notes
- Ensure the user running the container (often root or specific UID) has Read/Write permissions to the TrueNAS Datasets (`/mnt/pool1/orders` and `meili_data`).
- If using TrueNAS Scale "Apps", you may need to configure "Run As User" or ACLs on the dataset.
