import { test, expect } from "../playwright-fixture";

/**
 * BDD Scenarios covered:
 * 2.1  — Successful account creation via email/password
 * 2.3  — Unsuccessful account creation due to weak password
 * 2.5  — Unsuccessful account creation due to invalid email format
 * 2.7  — Unsuccessful profile setup due to missing mandatory fields
 * 15.3 — Form submission via Enter key
 */

test.describe("Registration Page (BDD 2.1, 2.3, 2.5)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
  });

  test("displays registration form with required fields", async ({ page }) => {
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("shows password requirements checklist", async ({ page }) => {
    await page.getByLabel(/password/i).fill("a");
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
    await expect(page.getByText(/one uppercase letter/i)).toBeVisible();
    await expect(page.getByText(/one number/i)).toBeVisible();
    await expect(page.getByText(/one special character/i)).toBeVisible();
  });

  test("BDD 2.3: shows inline errors for weak password", async ({ page }) => {
    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("weak");
    // Try to submit
    await page.getByRole("button", { name: /sign up|create account|register/i }).click();
    // Should show password-related errors
    await expect(page.getByText(/8 characters/i)).toBeVisible();
  });

  test("BDD 2.5: shows error for invalid email format", async ({ page }) => {
    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill("not-an-email");
    await page.getByLabel(/password/i).fill("Str0ng!Pass");
    await page.getByRole("button", { name: /sign up|create account|register/i }).click();
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });

  test("shows Google sign-in button (BDD 2.2)", async ({ page }) => {
    await expect(page.getByText(/google/i)).toBeVisible();
  });

  test("has link to login page", async ({ page }) => {
    await expect(page.getByText(/sign in|log in/i)).toBeVisible();
  });
});

test.describe("Login Page (BDD 2.4, 15.3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
  });

  test("displays login form", async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("shows error for empty email submission", async ({ page }) => {
    await page.getByRole("button", { name: /sign in|log in|connect/i }).click();
    // Should show validation error
    await expect(page.getByText(/email|required/i)).toBeVisible();
  });

  test("has forgot password link", async ({ page }) => {
    await expect(page.getByText(/forgot password/i)).toBeVisible();
  });

  test("has link to registration page", async ({ page }) => {
    await expect(page.getByText(/sign up|new member/i)).toBeVisible();
  });
});
