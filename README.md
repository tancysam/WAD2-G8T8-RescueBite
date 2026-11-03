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

These tests check that a business can create, edit and remove a listing, and view its impact figures on the dashboard.

- Creates and publishes a listing, then checks that it remains after refresh.
- Edits the title, description, price and quantity, then checks the saved values.
- Removes a listing and checks the Active and Removed tabs.
- Checks that the dashboard figures match the impact API response.

Use `demo_business` with an active business and an available category. Set the password and the path to a food photo (JPEG, PNG or WebP, maximum 5 MB). Each listing test removes its own test listing afterwards.

Run from `frontend`:

```powershell
$env:E2E_BUSINESS_PASSWORD = 'PASTE_BUSINESS_PASSWORD_HERE'
$env:E2E_LISTING_IMAGE = 'C:\Users\YOUR_NAME\Pictures\food.jpg'
pnpm exec playwright test e2e_testing/business.spec.js
pnpm exec playwright show-report
```
