import { test, expect } from '@playwright/test'

test.use({
  geolocation: { latitude: 1.29688, longitude: 103.852261 },
  permissions: ['geolocation']
})

const title = 'Char Kway Teow (E2E testing)'

async function openListing(page) {
  await page.goto('/explore')
  await page.getByRole('searchbox', { name: 'Search listings' }).fill(title)
  await page.getByRole('link', { name: 'View details for ' + title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('Consumer_reserves and cancels a single item', async ({ page }) => {
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  await openListing(page)
  const startingQuantity = parseInt(await page.locator('.availability').textContent(), 10)
  const price = (await page.locator('.price-card .price').textContent()).trim()
  const business = (await page.locator('.business-line').textContent()).trim()
  const address = (await page.locator('.address').innerText()).split('\n')[0].trim()
  const pickupDay = (await page.locator('aside section .row > div:nth-child(2) .time-card .day').textContent()).trim()
  const pickupTime = (await page.locator('aside section .row > div:nth-child(2) .time-card .time').textContent()).trim()
  expect(startingQuantity).toBeGreaterThan(0)

  let reserved = false
  try {
    await page.getByRole('button', { name: 'Reserve listing' }).click()
    await expect(page.getByRole('heading', { name: 'Pay to confirm' })).toBeVisible()
    reserved = true
    await page.getByRole('link', { name: 'Pay later' }).click()
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()

    const firstOrder = page.locator('.orders-list > section:first-child .order-row')
    await expect(firstOrder.getByRole('heading', { name: title })).toBeVisible()
    await expect(firstOrder.locator('.order-statuses')).toHaveText(/RESERVED/)
    await firstOrder.getByRole('button', { name: 'View details' }).click()

    const details = page.getByRole('dialog', { name: title })
    const summary = details.getByRole('region', { name: 'Reservation summary' })
    await expect(details.getByText(business)).toBeVisible()
    await expect(summary.locator('.row > div:nth-child(1) .rb-status')).toHaveText('RESERVED')
    await expect(summary.locator('.row > div:nth-child(2) .fw-semibold')).toHaveText('1')
    await expect(summary.locator('.row > div:nth-child(3) .fw-semibold')).toHaveText(price)
    await expect(summary.locator('.row > div:nth-child(4) .fw-semibold')).toHaveText(pickupDay + ' ' + pickupTime)
    await expect(summary.locator('.row > div:nth-child(5) .fw-semibold')).toHaveText(address)
    await expect(details.locator('.instructions .mb-0')).toHaveText(/\S/)
    await expect(details.getByText('Pickup location')).toBeVisible()
    await details.getByRole('button', { name: 'Close details' }).click()

    await openListing(page)
    await expect(page.locator('.availability')).toHaveText(`${startingQuantity - 1} available`)

    await page.goto('/my-orders')
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()
    await expect(firstOrder.getByRole('heading', { name: title })).toBeVisible()
    await firstOrder.getByRole('button', { name: 'Cancel order' }).click()
    await page.getByRole('dialog', { name: 'Cancel this reservation?' }).getByRole('button', { name: 'Yes, cancel order' }).click()
    reserved = false
    await expect(page.getByRole('status')).toHaveText(/Reservation cancelled/)

    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Cancelled / }).click()
    await expect(firstOrder.getByRole('heading', { name: title })).toBeVisible()
    await expect(firstOrder.locator('.order-statuses')).toHaveText(/CANCELLED/)

    await openListing(page)
    await expect(page.locator('.availability')).toHaveText(`${startingQuantity} available`)
  } finally {
    if (reserved) {
      await page.goto('/my-orders')
      await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()
      const firstOrder = page.locator('.orders-list > section:first-child .order-row')
      await expect(firstOrder.getByRole('heading', { name: title })).toBeVisible()
      await firstOrder.getByRole('button', { name: 'Cancel order' }).click()
      await page.getByRole('dialog', { name: 'Cancel this reservation?' }).getByRole('button', { name: 'Yes, cancel order' }).click()
    }
  }
})
