import { test, expect } from '@playwright/test'

test.use({
  geolocation: { latitude: 1.29688, longitude: 103.852261 },
  permissions: ['geolocation']
  // ensure that in all tests, map begins within an area that test listings can be found
})

test('Consumer_search for business using search function', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  await page.goto('/businesses')
  await expect(page.getByRole('heading', { name: 'Businesses' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search businesses' }).fill('carrot cake')
  await expect(page.locator('article h2')).toHaveText([/Tom.s carrot cake/i])
  await expect(page.locator('article .rb-pickup span')).toHaveText(/\S/)

  await page.getByRole('link', { name: 'View business' }).click()
  await expect(page.getByRole('heading', { name: /Tom.s carrot cake/i })).toBeVisible()
  await expect(page.locator('.info-list div:nth-child(2) dd')).toHaveText(/\S/)
})

test('Consumer_search for listing and view its details', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  const title = 'Char Kway Teow (E2E testing)'
  await page.goto('/explore')
  await page.getByRole('searchbox', { name: 'Search listings' }).fill(title)
  await expect(page.locator('article h3')).toHaveText([title])
  await expect(page.locator('article .meta')).toHaveText(/Tom.s carrot cake/i)

  await page.getByRole('link', { name: 'View details for ' + title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.locator('.business-line')).toHaveText(/Tom.s carrot cake/i)
})

test('Consumer_filter listings by item and bundle', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  await page.goto('/explore')
  await page.getByRole('group', { name: 'Listing type' }).getByRole('button', { name: 'Items' }).click()
  await expect(page.locator('.filter-controls .rb-chip.active')).toHaveText('Items')
  await expect(page.getByRole('heading', { name: 'Char Kway Teow (E2E testing)' })).toBeVisible()

  await page.getByRole('group', { name: 'Listing type' }).getByRole('button', { name: 'Bundles' }).click()
  await expect(page.locator('.filter-controls .rb-chip.active')).toHaveText('Bundles')
  await expect(page.getByRole('heading', { name: 'Char Kway Teow & Carrot Cake (E2E testing)' })).toBeVisible()
})
