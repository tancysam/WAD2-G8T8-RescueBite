# WAD2-G8T8-RescueBite
A surplus food rescue platform connecting food businesses with nearby consumers to reduce food waste through discounted listings, rescue bundles, reservations, and location-based discovery.

Deployed app: https://rescuebite.tancysam.dev

## E2E Testing

### 1. Login / Authentication

These tests use the existing `test-consumer` and `test-business` accounts against the deployed app. They check the following:

- Signing in as a consumer arrives at /explore, while signing in as a business arrives at /business-dashboard.
- Each session survives a refresh.
- A signed-out visit to /explore redirects to /login.
- An incorrect password shows an error and does not open a protected page.

From the project root, run:

```powershell
cd frontend
pnpm install
pnpm exec playwright install chromium
$env:E2E_TEST_PASSWORD = 'PASTE_TEST_PASSWORD_HERE'
pnpm exec playwright test e2e_testing/login.spec.js
pnpm exec playwright show-report
```

Replace `PASTE_TEST_PASSWORD_HERE` with the shared test-account password, keeping the single quotes. The install commands are needed only once. The report shows four tests and their results. The test account usernames are `test-consumer` and `test-business`.
