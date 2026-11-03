import { test, expect } from '@playwright/test'

// Use the same dedicated demo business account as the login tests.
async function signIn(page) {
  const password = process.env.E2E_BUSINESS_PASSWORD
  if (!password) throw new Error('Set E2E_BUSINESS_PASSWORD before running business tests')

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill('demo_business')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard' })).toBeVisible()
}

// datetime-local inputs need local time rather than a UTC timestamp.
function collectionTime(hoursFromNow) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

async function createListing(page, title) {
  const image = process.env.E2E_LISTING_IMAGE
  if (!image) throw new Error('Set E2E_LISTING_IMAGE to a JPEG, PNG or WebP file before running listing tests')

  await page.goto('/business-listings/create')
  await page.getByRole('button', { name: 'Enter details manually' }).click()
  await page.getByLabel('Business', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Listing image', { exact: true }).setInputFiles(image)
  await page.getByLabel('Listing type', { exact: true }).selectOption('ITEM')
  await page.getByLabel('Category', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Description', { exact: true }).fill('A meal created for business E2E testing.')
  await page.getByLabel('Original price (S$)', { exact: true }).fill('10')
  await page.getByLabel('Rescue price (S$)', { exact: true }).fill('5')
  await page.getByLabel('Quantity available', { exact: true }).fill('3')
  await page.getByLabel('From', { exact: true }).fill(collectionTime(1))
  await page.getByLabel('Until', { exact: true }).fill(collectionTime(3))
  await page.getByLabel('Listing status', { exact: true }).selectOption('ACTIVE')
  await page.getByRole('button', { name: 'Create listing manually', exact: true }).click()
  await expect(page).toHaveURL(/\/business-listings$/)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

// Only remove the unique listing created by this test, never the consumer fixtures.
async function removeTestListing(page, title) {
  await page.goto('/business-listings')
  await expect(page.getByRole('link', { name: '+ Create listing', exact: true })).toBeVisible()
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  if (await card.count() === 0) return
  const remove = card.getByRole('button', { name: 'Remove', exact: true })
  if (await remove.count() === 0) return
  await remove.click()
  await page.getByRole('button', { name: 'Confirm remove', exact: true }).click()
  await expect(card.locator('.rb-status')).toHaveText('Removed')
}

test('Business_creates and publishes a listing with predefined fields', async ({ page }) => {
  test.setTimeout(90000)
  await signIn(page)
  const title = 'Business create (E2E testing) ' + Date.now()

  try {
    await createListing(page, title)
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await expect(card.locator('.rb-status')).toHaveText('Active')
    await expect(card.locator('.card-text')).toHaveText('A meal created for business E2E testing.')
    await expect(card.locator('.rb-tag-light')).toHaveText('3 left')
    await expect(card.locator('.prices strong')).toHaveText('S$5.00')
    await expect(card.locator('.prices del')).toHaveText('S$10.00')

    await page.reload()
    await expect(card.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(card.locator('.rb-status')).toHaveText('Active')

    await page.goto('/business-dashboard')
    const row = page.getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row.locator('.rb-status')).toHaveText('ACTIVE')
  } finally {
    await removeTestListing(page, title)
  }
})

test('Business_edits a listing and saves the changes', async ({ page }) => {
  test.setTimeout(90000)
  await signIn(page)
  const title = 'Business edit (E2E testing) ' + Date.now()
  const updatedTitle = title + ' updated'
  let currentTitle = title

  try {
    await createListing(page, title)
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await card.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill(updatedTitle)
    await page.getByLabel('Description', { exact: true }).fill('Updated meal description.')
    await page.getByLabel('Rescue price (S$)', { exact: true }).fill('4')
    await page.getByLabel('Quantity available', { exact: true }).fill('4')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page).toHaveURL(/\/business-listings$/)
    currentTitle = updatedTitle

    const updatedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: updatedTitle, exact: true }) })
    await expect(updatedCard.locator('.card-text')).toHaveText('Updated meal description.')
    await expect(updatedCard.locator('.prices strong')).toHaveText('S$4.00')
    await expect(updatedCard.locator('.rb-tag-light')).toHaveText('4 left')

    await page.reload()
    await updatedCard.getByRole('link', { name: 'Edit', exact: true }).click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(updatedTitle)
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Updated meal description.')
    await expect(page.getByLabel('Rescue price (S$)', { exact: true })).toHaveValue('4')
    await expect(page.getByLabel('Quantity available', { exact: true })).toHaveValue('4')
  } finally {
    // Check both names in case saving succeeded but navigation failed.
    await removeTestListing(page, currentTitle)
    if (currentTitle !== updatedTitle) await removeTestListing(page, updatedTitle)
  }
})

test('Business_removes a listing from active listings', async ({ page }) => {
  test.setTimeout(90000)
  await signIn(page)
  const title = 'Business remove (E2E testing) ' + Date.now()

  try {
    await createListing(page, title)
    await removeTestListing(page, title)

    await page.reload()
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Active / }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Removed / }).click()
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await expect(card.locator('.rb-status')).toHaveText('Removed')
    await expect(card.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)
  } finally {
    await removeTestListing(page, title)
  }
})

test('Business_views impact figures on the dashboard', async ({ page }) => {
  test.setTimeout(60000)
  await signIn(page)

  await page.emulateMedia({ reducedMotion: 'reduce' })

  // Read the real response, without mocking the dashboard or changing any orders.
  const impactResponse = page.waitForResponse(response =>
    /\/businesses\/[^/]+\/impact$/.test(new URL(response.url()).pathname) &&
    response.request().method() === 'GET'
  )
  await page.goto('/business-dashboard')
  const response = await impactResponse
  expect(response.ok()).toBeTruthy()
  const { impact } = await response.json()

  await expect(page.getByRole('heading', { name: 'Impact', exact: true })).toBeVisible()
  const meals = page.locator('.kpi').filter({ hasText: 'Meals rescued' })
  const food = page.locator('.kpi').filter({ hasText: 'Food saved' })
  const revenue = page.locator('.kpi').filter({ hasText: 'Revenue recovered' })
  const savings = page.locator('.kpi').filter({ hasText: 'Customer savings' })

  await expect(meals.locator('.kpi-value')).toHaveText(Number(impact.mealsRescued).toLocaleString('en-US'))
  await expect(food.locator('.kpi-value')).toHaveText(Number(impact.estimatedKgSaved).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' kg')
  await expect(revenue.locator('.kpi-value')).toHaveText('S$' + Number(impact.revenueSgd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  await expect(savings.locator('.kpi-value')).toHaveText('S$' + Number(impact.customerSavingsSgd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  await expect(page.getByRole('heading', { name: 'Meals rescued per week', exact: true })).toBeVisible()
})
