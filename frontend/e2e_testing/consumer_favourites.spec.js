import { test, expect } from '@playwright/test'

const listingTitle = 'Char Kway Teow (E2E testing)'

async function openTestBusiness(page) {
  await page.goto('/businesses')
  await page.getByRole('searchbox', { name: 'Search businesses' }).fill('carrot cake')
  await expect(page.locator('article h2')).toHaveText([/Tom.s carrot cake/i])
  await page.getByRole('link', { name: 'View business' }).click()
  await expect(page.getByRole('heading', { name: /Tom.s carrot cake/i })).toBeVisible()
}

async function openTestListing(page) {
  await openTestBusiness(page)
  await page.getByRole('link', { name: 'View details for ' + listingTitle }).click()
  await expect(page.getByRole('heading', { name: listingTitle })).toBeVisible()
}

test('Consumer_adds and removes business from favourites', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  await openTestBusiness(page)
  await expect(page.getByRole('button', { name: 'Save business' })).toBeVisible()

  await page.getByRole('button', { name: 'Save business' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  await page.goto('/favourites')
  await expect(page.getByRole('heading', { name: 'My favourites' })).toBeVisible()
  const businessCard = page.locator('section[aria-labelledby="saved-businesses"] article').filter({
    has: page.getByRole('heading', { name: /Tom.s carrot cake/i })
  })
  await expect(businessCard).toBeVisible()
  await businessCard.getByRole('button', { name: 'Remove' }).click()
  await expect(businessCard).not.toBeVisible()
})

test('Consumer_adds and removes listing from favourites', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  await openTestListing(page)
  await expect(page.getByRole('button', { name: 'Save listing' })).toBeVisible()

  await page.getByRole('button', { name: 'Save listing' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  await page.goto('/favourites')
  await expect(page.getByRole('heading', { name: 'My favourites' })).toBeVisible()
  const listingCard = page.locator('section[aria-labelledby="saved-listings"] .row > .col').filter({
    has: page.getByRole('heading', { name: listingTitle })
  })
  await expect(listingCard).toBeVisible()
  await listingCard.getByRole('button', { name: 'Remove from favourites' }).click()
  await expect(listingCard).not.toBeVisible()
})
