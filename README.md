# Customer Order Photo Search Portal

## Overview

The **Customer Order Photo Search Portal** is a mobile-friendly web application designed to streamline the process of locating customer order photos stored on a local NAS (Network Attached Storage). It provides a fast, searchable interface for accessing order photos by various attributes such as product type, size, wood type, and finish, replacing the inefficient manual folder lookup process.

This tool was built to solve a specific efficiency need for a contracting client. In their workflow, they need to quickly locate product photos to communicate order updates to customers and to identify high-quality images for marketing materials. In their workflow, this takes place outside of an ERP, and they have to navigate a complex folder structure to find photos, which is time-consuming and error-prone. This application creates a metadata layer over the file system and indexes it, enabling powerful fuzzy search capabilities.

## Project Goals

### Technical Exploration
This project serves as a practical way to showcase the use of **Generative AI** in modern software development. It also provides an opportunity to gain hands-on experience with:
*   **.NET 8**: Leveraging the latest features of the implementation of the API and Worker services.
*   **React**: Building a modern, responsive frontend with TypeScript.
*   **Docker**: Containerizing the entire stack for consistent deployment.

### Business Solution
Beyond technical learning, this application addresses a real-world business efficiency problem. The client previously relied on navigating a complex folder structure to find photos, which was time-consuming and error-prone. This application creates a searchable metadata layer, allowing for instant retrieval of photos based on order details, significantly improving their daily workflow for customer service and marketing tasks.

## Getting Started

### Prerequisites
*   **Docker Desktop** (or Docker Engine)
*   **Git**

### Environment Configuration
Create a `.env` file in the root directory with the following variables:

| Variable | Description |
| :--- | :--- |
| `ORDERS_PATH` | Absolute path to the local directory containing order folders. |
| `ORDERS_DISPLAY_PATH` | The path to display in the UI for users to copy (e.g., a UNC path like `\\server\share\orders`). |
| `MEILI_DATA_PATH` | Host path for persisting the Meilisearch data index (e.g., `/mnt/app_data/meili_data`). |
| `MEILISEARCH_MASTER_KEY` | A secure key for protecting the Meilisearch instance. |
| `VOLUSION_API_URL` | The base URL for the Volusion store API. |
| `VOLUSION_API_LOGIN` | Login email/username for the Volusion API. |
| `VOLUSION_API_PW` | Encrypted password for the Volusion API. |
| `CRON_SCHEDULE` | Cron expression for scheduled reindexing (default: `0 4 * * *` for 4 AM). |

### Running the Application

1.  Clone the repository.
2.  Ensure your `.env` file is configured.
3.  Run the application using Docker Compose:

```bash
docker-compose up -d --build
```

The application services will be available at:
*   **Frontend**: `http://localhost:3000`
*   **API**: `http://localhost:8081`
*   **Meilisearch**: `http://localhost:7700`

## Data Structure

The application expects a specific folder structure to function correctly:

### Order Directory (`ORDERS_PATH`)
The root `ORDERS_PATH` should contain subdirectories for each order, where the folder name corresponds strictly to the **Order ID** (e.g., `12345`).

```text
/mnt/orders
├── 10001
│   ├── photo1.jpg
│   └── photo2.jpg
├── 10002
│   └── photo1.jpg
...
```

### Data Integration
The system ingests order data from the Volusion XML API. It matches the folder names (Order IDs) with the XML data to index attributes like Product Code, Options, and Order Date.

## Technologies Used

### Frontend
*   **Framework**: React 19 (via Vite)
*   **Language**: TypeScript
*   **Routing**: React Router Dom
*   **Icons**: Lucide React

### Backend
*   **API**: ASP.NET Core 8 Minimal API
*   **Language**: C#
*   **Worker Service**: .NET Worker for background ingestion and nightly synchronization
*   **Integration**: Volusion API (XML) for ecommerce data ingestion

### Infrastructure
*   **Search Engine**: Meilisearch (Dockerized)
*   **Containerization**: Docker & Docker Compose
*   **Reverse Proxy**: Nginx (serving frontend and proxying API requests)

## AI-Driven Development

This project was built using **Generative AI** technologies, specifically **Antigravity** by Google DeepMind.

*   **Primary Models**: Claude 4.5 and Gemini 3 Pro.
*   **Development Process**:
    1.  **Collaborative Design**: The project began with a high-level discussion to define requirements, resulting in a detailed Design Document (`Documentation/DesignDocument.md`).
    2.  **AI Implementation**: The AI then acted upon these requirements, generating the initial project structure, coding the backend services, implementing the complex ingestion pipelines, and building the responsive React frontend.
    3.  **Iterative Refinement**: The AI and user pair-programmed to refine features, debug issues (such as Docker path mapping and API integrations), and polish the UI/UX.
