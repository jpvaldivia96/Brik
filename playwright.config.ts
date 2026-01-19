import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for BRIK Pro
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    // Directory containing test files
    testDir: './tests',

    // Run tests in parallel
    fullyParallel: true,

    // Fail the build on CI if you accidentally left test.only in the source code
    forbidOnly: !!process.env.CI,

    // Retry failed tests (more retries on CI)
    retries: process.env.CI ? 2 : 0,

    // Number of parallel workers
    workers: process.env.CI ? 1 : undefined,

    // Reporter configuration
    reporter: [
        ['html', { open: 'never' }],
        ['list']
    ],

    // Shared settings for all tests
    use: {
        // Base URL for navigation
        baseURL: 'http://localhost:8083',

        // Collect trace when retrying a failed test
        trace: 'on-first-retry',

        // Take screenshot on failure
        screenshot: 'only-on-failure',

        // Video recording on failure
        video: 'on-first-retry',
    },

    // Configure projects for major browsers
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Uncomment to test on more browsers:
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'Mobile Chrome',
        //   use: { ...devices['Pixel 5'] },
        // },
    ],

    // Run local dev server before starting the tests
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:8083',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000, // 2 minutes to start
    },
});
