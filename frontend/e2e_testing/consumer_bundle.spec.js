import { test, expect } from '@playwright/test'

test.use({
  geolocation: { latitude: 1.3023423, longitude: 103.8765402 },
  permissions: ['geolocation']
})

test('Consumer_reserves and cancels a cross-business bundle', async ({ page }) => {
  const mixedTitle = 'Mixed Vegetable Meal Box'
  const chickenTitle = 'Chicken Rice Meal'
  const password = process.env.E2E_CONSUMER_PASSWORD
  if (!password) throw new Error('Set E2E_CONSUMER_PASSWORD before running consumer tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_consumer')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Explore' })).toBeVisible()

  async function inspectListing(title) {
    await page.goto('/explore')
    await page.getByRole('searchbox', { name: 'Search listings' }).fill(title)
    await page.getByRole('link', { name: 'View details for ' + title }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    const item = {
      title: title,
      quantity: parseInt(await page.locator('.availability').textContent(), 10),
      price: Number((await page.locator('.price-card .price').textContent()).trim().slice(2)),
      business: (await page.locator('.business-line').textContent()).trim(),
      address: (await page.locator('.address').innerText()).split('\n')[0].trim(),
      pickupDay: (await page.locator('aside section .row > div:nth-child(2) .time-card .day').textContent()).trim(),
      pickupTime: (await page.locator('aside section .row > div:nth-child(2) .time-card .time').textContent()).trim()
    }
    return item
  }

  const mixed = await inspectListing(mixedTitle)
  const chicken = await inspectListing(chickenTitle)
  expect(mixed.quantity).toBeGreaterThan(1)
  expect(chicken.quantity).toBeGreaterThan(1)
  expect(mixed.business).toMatch(/Dabba Street/i)
  expect(chicken.business).not.toBe(mixed.business)

  const discounted = (item) => Math.round(item.price * 90) / 100
  const money = (amount) => 'S$' + amount.toFixed(2)
  const expectedTotal = money(discounted(mixed) + discounted(chicken))
  const remaining = []

  try {
    await inspectListing(mixedTitle)
    const chickenOption = page.locator('.bundle-option').filter({ hasText: chicken.title })
    await expect(chickenOption).toBeVisible()
    await expect(chickenOption.locator('.bundle-business')).toHaveText(chicken.business)
    await chickenOption.click()
    await expect(chickenOption.locator('.bundle-price')).toHaveText(money(discounted(chicken)))
    await expect(page.locator('.bundle-summary strong')).toHaveText(expectedTotal)

    await page.getByRole('button', { name: 'Reserve both items' }).click()
    await expect(page.getByRole('heading', { name: 'Both items are held' })).toBeVisible()
    remaining.push(mixed.title, chicken.title)
    await page.getByRole('link', { name: 'Go to My Orders' }).click()
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()

    const bundle = page.locator('.orders-list > section:first-child.bundle-order')
    await expect(bundle.locator('.bundle-copy')).toHaveText('2 items · 10% discount applied')
    await expect(bundle.locator('.bundle-total strong')).toHaveText(expectedTotal)

    for (const item of [mixed, chicken]) {
      const row = bundle.locator('.order-row').filter({ hasText: item.title })
      await expect(row.getByRole('heading', { name: item.title })).toBeVisible()
      await expect(row.locator('.order-statuses')).toHaveText(/RESERVED/)
      await row.getByRole('button', { name: 'View details' }).click()

      const details = page.getByRole('dialog', { name: item.title })
      const summary = details.getByRole('region', { name: 'Reservation summary' })
      await expect(details.getByText(item.business, { exact: true })).toBeVisible()
      await expect(summary.locator('.row > div:nth-child(1) .rb-status')).toHaveText('RESERVED')
      await expect(summary.locator('.row > div:nth-child(2) .fw-semibold')).toHaveText('1')
      await expect(summary.locator('.row > div:nth-child(3) .fw-semibold')).toHaveText(money(discounted(item)))
      await expect(summary.locator('.row > div:nth-child(4) .fw-semibold')).toHaveText(item.pickupDay + ' ' + item.pickupTime)
      await expect(summary.locator('.row > div:nth-child(5) .fw-semibold')).toHaveText(item.address)
      await expect(details.locator('.instructions .mb-0')).toHaveText(/\S/)
      await expect(details.getByText('Pickup location')).toBeVisible()
      await details.getByRole('button', { name: 'Close details' }).click()

      await inspectListing(item.title)
      await expect(page.locator('.availability')).toHaveText(`${item.quantity - 1} available`)
      await page.goto('/my-orders')
      await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()
    }

    for (const item of [mixed, chicken]) {
      const row = page.locator('.orders-list > section:first-child.bundle-order .order-row').filter({ hasText: item.title })
      await row.getByRole('button', { name: 'Cancel order' }).click()
      await page.getByRole('dialog', { name: 'Cancel this reservation?' }).getByRole('button', { name: 'Yes, cancel order' }).click()
      remaining.splice(remaining.indexOf(item.title), 1)
      await expect(page.getByRole('status')).toHaveText(/Reservation cancelled/)
    }

    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Cancelled / }).click()
    const cancelledBundle = page.locator('.orders-list > section:first-child.bundle-order')
    for (const item of [mixed, chicken]) {
      const row = cancelledBundle.locator('.order-row').filter({ hasText: item.title })
      await expect(row.getByRole('heading', { name: item.title })).toBeVisible()
      await expect(row.locator('.order-statuses')).toHaveText(/CANCELLED/)
    }
    for (const item of [mixed, chicken]) {
      await inspectListing(item.title)
      await expect(page.locator('.availability')).toHaveText(`${item.quantity} available`)
    }
  } finally {
    for (const itemTitle of remaining) {
      await page.goto('/my-orders')
      await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Reserved / }).click()
      const row = page.locator('.orders-list > section:first-child.bundle-order .order-row').filter({ hasText: itemTitle })
      await expect(row.getByRole('heading', { name: itemTitle })).toBeVisible()
      await row.getByRole('button', { name: 'Cancel order' }).click()
      await page.getByRole('dialog', { name: 'Cancel this reservation?' }).getByRole('button', { name: 'Yes, cancel order' }).click()
    }
  }
})
