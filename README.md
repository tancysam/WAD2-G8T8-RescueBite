# WAD2-G8T8-RescueBite
A surplus food rescue platform connecting food businesses with nearby consumers to reduce food waste through discounted listings, rescue bundles, reservations, and location-based discovery.

Deployed app: https://rescuebite.tancysam.dev

## E2E Testing

### Setup
The tests use dedicated demo accounts against the deployed app. From the project root, install dependencies and Chromium once:

```powershell
cd frontend
pnpm install
pnpm exec playwright install chromium
```

In each new PowerShell session, set the two demo account passwords before running tests:

```powershell
$env:E2E_CONSUMER_PASSWORD = 'PASTE_CONSUMER_PASSWORD_HERE'
$env:E2E_BUSINESS_PASSWORD = 'PASTE_BUSINESS_PASSWORD_HERE'
```

### 1. Login / Authentication
This test checks sign-in and access to protected pages:

- A signed-out visit to /explore redirects to /login.
- Signing in as a consumer arrives at /explore, while signing in as a business arrives at /business-dashboard.
- Each session survives a refresh.
- An incorrect password shows an error and does not open a protected page.

Run:

```powershell
pnpm exec playwright test e2e_testing/login.spec.js
pnpm exec playwright show-report
```

### 2. Consumer Discover

This test checks that a consumer is able to discover businesses and listings via search and filters, and view their details respectively:

- Consumers are able to search for a business using search, and view its details.
- Consumers are able to search for a given listing and view its details.
- Consumers are able to filter lisitngs by Items and Bundles and see the corresponding listings.

Run:

```powershell
pnpm exec playwright test 'e2e_testing/consumer_discovery.spec.js'
pnpm exec playwright show-report
```

### 3. Consumer Favourites

This test checks that a consumer is able to add and remove a business and listing to/from favourites, and check that it reflects accordingly.

- Consumer adds a business to favourites, checks that it appears in Favourites, then removes it and checks that it no longer appears in Favourites. 
- Consumer adds a listing to favourites, checks that it appears in Favourites, then removes it and checks that it no longer appears in Favourites.

```powershell
pnpm exec playwright test e2e_testing/consumer_favourites.spec.js
pnpm exec playwright show-report
```

### 4. Consumer Reservation and Cancellation

This test checks that a consumer is able to reserve an active listing or cross-business bundle, view it in upcoming orders, and viewing further details show the information correctly. It then checks that cancelling the order reflects correctly in Cancelled orders.

- Reserves one item, chooses Pay later, and checks that the newest Reserved order and its details match the listing.
- Checks that the listing quantity is updated accordingly.
- Cancels that order, checks that the newest Cancelled order reflects the cancellation, and checks that the listing quantity returns to its starting value.

Run:

```powershell
pnpm exec playwright test e2e_testing/consumer_reservations.spec.js
pnpm exec playwright show-report
```

### 5. Business Listings and Impact

These tests use `demo_business` and the same Playwright setup as the consumer tests.

Before running, set a path to an existing food photo (JPEG, PNG or WebP, no more than 5 MB). The file stays on your computer and is uploaded through the listing form:

```powershell
$env:E2E_BUSINESS_PASSWORD = 'PASTE_BUSINESS_PASSWORD_HERE'
$env:E2E_LISTING_IMAGE = 'C:\Users\YOUR_NAME\Pictures\food.jpg'
pnpm exec playwright test e2e_testing/business.spec.js
pnpm exec playwright show-report
```

Run these commands from `frontend`. The configured base URL is the deployed app, so local frontend/backend servers are not required.

- Creates a manual listing with predefined fields, checks the saved card after refresh and checks that it appears in the dashboard's live listings.
- Creates a separate test listing, edits its title, description, price and quantity, then reopens the edit form to check the saved values.
- Creates a separate test listing, removes it, then checks the Active and Removed tabs after refresh.
- Checks that the dashboard's four impact figures match the real impact API response. This checks display, not whether a completed collection increases the figures.

The demo business account needs an active business and at least one available category. Use the dedicated demo account only. Each listing test uses a unique title and attempts to remove only its own listing afterward. Removal is a soft delete, so test records can remain in the Removed tab. If creation fails during image upload, check for an unfinished test draft before rerunning. Existing consumer test listings are not edited or removed.

Syntax and test discovery were checked during implementation. Full browser execution still needs the demo password, food photo and access to the deployed app.
