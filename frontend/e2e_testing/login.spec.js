import { test, expect } from '@playwright/test'

async function signIn(page, username) {
  const password = process.env.E2E_TEST_PASSWORD
  expect(password, 'Set E2E_TEST_PASSWORD before running login tests').toBeTruthy()

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

test('signed-out visitors are sent to login', async ({ page }) => {
  await page.goto('/explore')
  await expect(page).toHaveURL(/\/login(?:\/.*)?$/)
  await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible()
})

for (const account of [
  { username: 'test-consumer', home: '/explore', nav: 'Explore' },
  { username: 'test-business', home: '/business-dashboard', nav: 'Dashboard' }
]) {
  test(`${account.username} logs in to the correct home page and stays signed in after refresh`, async ({ page }) => {
    await signIn(page, account.username)
    await expect(page).toHaveURL(new RegExp(`${account.home}$`)) // check that the home page is correct
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: account.nav })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`${account.home}$`))
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: account.nav })).toBeVisible()
  })
}
