# Test Coverage Documentation
**Project:** Customer Order Photo Search Portal    
**Date:** December 2025
**Version:** v1.0

This document outlines the testing infrastructure and current test coverage for the `hc-photo-search` project as of December 2025.

## 1. Worker Integration Tests
**File:** `HcPhotoSearch.Worker.Tests/WorkerIntegrationTests.cs`
- **Incremental_ProcessesNewOrders:** Verifies that incremental indexing correctly identifies and processes new orders.
- **FullReindex_ProcessesAllOrders:** Verifies that full reindexing processes all existing orders and updates their metadata.
- **NeedsReview_FlagsCustomOrders:** Ensures custom orders are automatically flagged for review.
- **NeedsReview_PreservesResult:** Verifies that existing "Needs Review" status is preserved during reindexing.
- **VolusionFailure_HandlesGracefully:** Confirms that the worker continues processing orders even if the Volusion API fails for some requests.

## 2. Frontend Tests (`hc-photo-search-ui`)
**Frameworks**: Vitest, React Testing Library, HappyDOM

*   **`App.test.tsx`**
    *   **Smoke Test**: Verifies that the main `<App />` component renders without crashing.
*   **`SearchPage.test.tsx`**
    *   **Render Test**: Confirms the search input field renders correctly.
    *   **Interaction Test**: Verifies that typing into the input updates the state.
    *   **Mocked Search Flow**:
        *   Mocks `axios` to prevent real network calls.
        *   Simulates a user typing a query and clicking "Search".
        *   **Assertions**:
            *   Verifies the API is called with the correct parameters (`/search?q=...`).
            *   Verifies the results are displayed in the UI (e.g., correct Order Number and Product Name).
    *   **Navigation Tests**:
        *   Verifies navigation to the upload page when the "Upload Photos" button is clicked.
        *   Verifies navigation to the admin page when the "Admin Panel" button is clicked.
    *   **State Tests**:
        *   **Loading**: Verifies "Searching..." text and disabled button state during API calls.
        *   **Empty Results**: Confirms "No orders found" message displays correctly.
        *   **Clear Search**: Verifies functionality of the 'X' button to reset search state.
        *   **Error Handling**: Ensures API errors are handled gracefully without crashing the UI.
    *   **Result Card Interaction Tests**:
        *   **Copy Path**: Verifies that clicking the copy button writes the correct path to the clipboard.
        *   **Edit Navigation**: Confirms the "Edit" button navigates to the correct admin URL.
        *   **External Link**: Checks that the "Order" link has the correct URL and `target="_blank"` attribute.
*   **`UploadPage.test.tsx`**
    *   **Render Test**: Verifies the page header and form elements render correctly.
    *   **Validation Tests**:
        *   **Missing Order Number**: Verifies error message when submitting without an order number.
        *   **Disabled Button**: Verifies submit button is disabled when no files are selected.
    *   **File Handling Tests**:
        *   **Add/Remove Files**: Verifies adding files enables submission and removing files updates the list.
    *   **Submission Tests**:
        *   **Success**: Verifies that valid form data (Order # + Files) is posted to `/upload-photos` and success message appears.
        *   **Error Handling**: Verifies that server errors during upload display the appropriate error message.

## 2. Backend API Tests (`HcPhotoSearch.Api.Tests`)
**Frameworks**: xUnit, Microsoft.AspNetCore.Mvc.Testing, RichardSzalay.MockHttp, Moq

*   **`IntegrationTests.cs`**
    *   **Setup**: Uses a temporary directory per test (via `ORDERS_PATH`) to ensure file system isolation. Implements `IDisposable` for cleanup.
    *   **Search**:
        *   `Get_Search_ReturnsOk`: Mocks Meilisearch, verifies search hits are returned.
        *   `Get_Autocomplete_ReturnsValues`: Mocks Meilisearch facet distribution, verifies autocomplete options.
    *   **Orders**:
        *   `Get_Order_ReturnsOrder`: Creates a dummy `order.meta.json`, verifies API returns it.
        *   `Put_UpdateOrder_UpdatesFileAndIndex`: Verification of full update flow.
            *   Updates `order.meta.json` on disk.
            *   Sends update to Meilisearch (mocked).
    *   **Admin**:
        *   `Post_Reindex_CreatesTrigger`: Verifies `reindex.trigger` file creation.
        *   `Post_Incremental_CreatesTrigger`: Verifies `incremental.trigger` file creation.
        *   `Get_Status_ReturnsStatus`: writes `reindex.status.json` and verifies API returns it correctly.
    *   **Upload**:
        *   `Post_UploadPhotos_SavesFiles`: Verifies multipart upload creates files in the correct order directory.

## 3. Backend Worker Tests (`HcPhotoSearch.Worker.Tests`)
**Frameworks**: xUnit, Moq

*   **`VolusionClientTests.cs`**
    *   **`GetOrderAsync_ReturnsOrder_WhenResponseIsSuccess`**:
        *   Mocks specific XML responses from Volusion.
        *   **Assertions**: Verifies XML is correctly parsed into `OrderMeta` objects.
    *   **`GetOrderAsync_UsesProductCode_WhenProductNameIsMissing`**:
        *   **Assertions**: Verifies fallback logic (using ProductCode if Name is missing).
    *   **`GetOrderAsync_SetsIsCustom_WhenProductNameIndicatesCustom`**:
        *   **Assertions**: Verifies business logic for detecting "Custom" orders based on keywords in the Product Name.

## 4. Other
*   **`HcPhotoSearch.IntegrationTests`**: An existing project that currently contains an empty placeholder test. It is not currently utilized.
