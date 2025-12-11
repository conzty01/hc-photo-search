# UI Requirements Document
**Project:** Customer Order Photo Search Portal    
**Date:** December 2025
**Version:** v1.2

## General Application Framework
- **Layout Philosophy**:
  - **Mobile-First**: All views are optimized for touch targets and small screens (e.g., iPhone SE width) first, scaling up to desktop.
  - **Theme Support**:
    - **Dark Mode**: Fully supported with high-contrast text.
    - **Toggle**: Controls located on the Admin page.
- **Global Navigation (Header)**:
  - **Logo/Title**: Tap to return to Home/Search reset.
  - **Toolbar Icons**:
    - **Upload**: Cloud-upload icon (Navigates to `/upload`).
    - **Admin**: Settings/Cog icon (Navigates to `/admin`).

## Search Page (Home)
- **Search Interface**:
  - **Input**:
    - Full-width, prominent text input.
    - **Behavior**: Auto-focus on page load. Real-time filtering as the user types (debounced).
    - **Clear Action**: 'X' button inside the input to instantly clear the query and reset focus.
- **Results Grid**:
  - **Layout**: Responsive grid (1 column mobile, 2 tablet, 3+ desktop).
  - **Empty State**: Friendly "No orders found" message with a clear call to action or suggestion.
- **Result Card**:
  - **Content**:
    - **Header**: Order Number (bold, prominent).
    - **Details**: Product Name (primary), Selected Options (secondary, wrapped).
    - **Highlights**: "Custom" badge if `isCustom` flag is true.
  - **Actions**:
    - **"Copy Path"**:
      - **Desktop**: Copies UNC path (`\\nas\orders\123`) to clipboard.
      - **Feedback**: Icon changes to checkmark, toast appears.
    - **"Edit"**:
      - Link to Admin Metadata Editor for this specific order.
    - **"View Order"**:
      - External link to the Volusion order page (opens in new tab).

## Admin Page
- **Page Layout**:
  - Divided into logical sections: "System Actions", "Order Management", and "Settings".
  - **Theme Selection**:
    - Dedicated card/section for "Appearance".
    - Toggle/Buttons to switch between Light or Dark modes.
    - Color picker for customizing the primary color.
- **System Actions**:
  - **Incremental Sync**:
    - **UI**: Primary, highlighted button (e.g., "Sync New Orders").
    - **Purpose**: Rapidly ingests only new orders or those with missing metadata. Intended for daily use.
  - **Full Reindex**:
    - **UI**: Secondary/Danger style button (e.g., "Full Reindex").
    - **Purpose**: Wipes and rebuilds the entire search index from the filesystem and Volusion API. Includes a confirmation modal warning of potential data loss (manual changes to `order.meta.json`).
- **Order Management**:
  - **Access**:
    - Directly from the Admin page via an "Edit Order" lookup.
    - Via the "Edit" button on any search result card.
  - **Metadata Editor**:
    - Displays a form to modify the order's associated metadata (e.g., keywords, options, product details).
    - **Single Order Reindex**:
      - **Action**: "Reindex" button.
      - **Purpose**: Fetches fresh data from the Volusion API and updates the local metadata and search index for *only* this specific order. Useful for fixing individual data discrepancies without a full system reindex.

## Upload Page
- **Page Layout**:
  - Functions as a standalone utility, focused purely on speed and ease of use on mobile devices.
- **Inputs**:
  - **Order Number**:
    - Numeric input field (validated).
    - Auto-focus on load for immediate entry.
  - **File Selector**:
    - Native file picker with multi-select support.
    - Captures photos directly from camera or gallery.
- **Actions**:
  - **"Upload Photos"**:
    - **Style**: Uses unified admin-style class (large, full-width on mobile) for visual prominence and touch target size.
    - **State**: Disabled until both Order Number and Files are present. Shows spinner during upload.
- **Feedback & Workflow**:
  - **Toast Notifications**: Real-time success/error messages (e.g., "Uploaded 5 photos for Order #12345").
  - **Form Reset**:
    - **On Success**: File selection and Order Number are cleared.
    - **On Error**: Form retains all data to allow retry.
