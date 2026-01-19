import { test, expect } from '@playwright/test';

/**
 * BRIK Pro - E2E Tests for Login Flow
 * 
 * Prerequisites:
 * - Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables
 * - Or create a .env.test file with these values
 */

// Test user credentials (should be set in environment or .env.test)
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@brik.pro';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'test123456';

test.describe('Authentication Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to the auth page before each test
        await page.goto('/auth');
    });

    test('should display login form correctly', async ({ page }) => {
        // Verify the page loads with correct elements
        await expect(page.locator('img[alt="BRIK"]')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        // Fill in invalid credentials
        await page.fill('#email', 'invalid@test.com');
        await page.fill('#password', 'wrongpassword');

        // Click login button
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Wait for error message
        await expect(page.locator('text=Invalid login credentials')).toBeVisible({ timeout: 10000 });
    });

    test('should show error for empty fields', async ({ page }) => {
        // Try to submit without filling fields
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // HTML5 validation should prevent submission
        // Check that we're still on auth page
        await expect(page).toHaveURL(/\/auth/);
    });

    test('should navigate to dashboard on successful login', async ({ page }) => {
        // Fill in valid test credentials
        await page.fill('#email', TEST_EMAIL);
        await page.fill('#password', TEST_PASSWORD);

        // Click login button
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Wait for navigation away from auth page
        // After successful login, user is redirected to site selector or dashboard
        await expect(page).not.toHaveURL(/\/auth/, { timeout: 15000 });

        // User should see some indication they're logged in
        // This could be the site selector page or dashboard
        await expect(page.locator('body')).not.toContainText('Iniciar sesión');
    });

    test('should toggle between login and register modes', async ({ page }) => {
        // Initially should be in login mode
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();

        // Click toggle to switch to register
        await page.click('text=¿No tienes cuenta? Regístrate');

        // Now should show "Crear cuenta" button
        await expect(page.getByRole('button', { name: /crear cuenta/i })).toBeVisible();

        // Click toggle to switch back to login
        await page.click('text=¿Ya tienes cuenta? Inicia sesión');

        // Should be back to login mode
        await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
    });
});
