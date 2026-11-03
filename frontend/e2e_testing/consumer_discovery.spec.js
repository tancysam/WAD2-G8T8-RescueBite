import { test, expect } from '@playwright/test'

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
  await expect(page.locator('article h2')).toHaveText(/Tom.s carrot cake/i)
  await expect(page.locator('article .rb-pickup span')).toHaveText(/\S/)

  await page.getByRole('link', { name: 'View business' }).click()
  await expect(page.getByRole('heading', { name: /Tom.s carrot cake/i })).toBeVisible()
  await expect(page.locator('.info-list div:nth-child(2) dd')).toHaveText(/\S/)
})
