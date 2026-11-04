import { test, expect } from '@playwright/test'

async function signIn(page, username, password) {
  expect(password, 'Set both demo account password variables before running login tests').toBeTruthy()

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

test('Signed-out visitors are sent to login', async ({ page }) => {
  await page.goto('/explore')
  await expect(page).toHaveURL(/\/login(?:\/.*)?$/)
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible()
})

for (const account of [
  { username: 'demo_consumer', password: process.env.E2E_CONSUMER_PASSWORD, home: '/explore', nav: 'Explore' },
  { username: 'demo_business', password: process.env.E2E_BUSINESS_PASSWORD, home: '/business-dashboard', nav: 'Dashboard' }
]) {
  test(`${account.username} logs in to the correct home page and stays signed in after refresh`, async ({ page }) => {
    await signIn(page, account.username, account.password)
    await expect(page).toHaveURL(new RegExp(`${account.home}$`)) // check that the home page is correct
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: account.nav })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`${account.home}$`))
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: account.nav })).toBeVisible()
  })
}

test('Incorrect password shows an error and stays on login', async ({ page }) => {
  await signIn(page, 'demo_consumer', 'definitely-wrong-e2e-password')
  await expect(page.getByText(/Password is incorrect/i).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login\/factor-one$/)
})
