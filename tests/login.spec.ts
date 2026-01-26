import { test, expect } from '@playwright/test';

/**
 * BRIK Pro - E2E Tests for Login Flow
 * 
 * Prerequisites:
 * - Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables
 * - Or create a .env.test file with these values
 */

// Test user credentials (should be set in environment or .env.test)
const TEST_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';
const HAS_TEST_CREDENTIALS = TEST_EMAIL && TEST_PASSWORD;

test.describe('Authentication Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to the auth page before each test
        await page.goto('/auth', { waitUntil: 'networkidle', timeout: 30000 });
        // Wait for page to be fully loaded
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form correctly', async ({ page }) => {
        // Wait for the form to be visible with longer timeout for CI
        await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

        // Verify the page loads with correct elements
        await expect(page.locator('img[alt="BRIK"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        // Wait for the form to be ready
        await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

        // Fill in invalid credentials
        await page.fill('#email', 'invalid@test.com');
        await page.fill('#password', 'wrongpassword123');

        // Click login button
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Wait for error message (could be in Spanish or English)
        await expect(page.locator('text=/Invalid|error|Error|inválido/i')).toBeVisible({ timeout: 15000 });
    });

    test('should show error for empty fields', async ({ page }) => {
        // Wait for the form to be ready
        await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

        // Try to click submit - HTML5 validation should prevent it
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // HTML5 validation should prevent submission
        // Check that we're still on auth page
        await expect(page).toHaveURL(/\/auth/);
    });

    // Skip this test if no test credentials are configured
    test('should navigate to dashboard on successful login', async ({ page }) => {
        test.skip(!HAS_TEST_CREDENTIALS, 'Skipped: TEST_USER_EMAIL and TEST_USER_PASSWORD not configured');

        // Wait for the form to be ready
        await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

        // Fill in valid test credentials
        await page.fill('#email', TEST_EMAIL);
        await page.fill('#password', TEST_PASSWORD);

        // Click login button
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Wait for navigation away from auth page
        // After successful login, user is redirected to site selector or dashboard
        await expect(page).not.toHaveURL(/\/auth/, { timeout: 20000 });

        // User should see some indication they're logged in
        // This could be the site selector page or dashboard
        await expect(page.locator('body')).not.toContainText('Iniciar sesión', { timeout: 10000 });
    });

    test('should toggle between login and register modes', async ({ page }) => {
        // Wait for the form to be ready
        await page.waitForSelector('#email', { state: 'visible', timeout: 15000 });

        // Initially should be in login mode
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();

        // Click toggle to switch to register (use more flexible selector)
        const registerToggle = page.locator('button:has-text("Regístrate"), text=Regístrate');
        await registerToggle.first().click();

        // Now should show "Crear cuenta" button
        await expect(page.getByRole('button', { name: /crear cuenta/i })).toBeVisible({ timeout: 5000 });

        // Click toggle to switch back to login
        const loginToggle = page.locator('button:has-text("Inicia sesión"), text=Inicia sesión');
        await loginToggle.first().click();

        // Should be back to login mode
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible({ timeout: 5000 });
    });
});
