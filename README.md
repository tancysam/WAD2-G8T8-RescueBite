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

### 2. Consumer Discover Functions

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
