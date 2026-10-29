import { expect, test } from "./fixtures/test";
import { login } from "./helpers";

test("signs in through the mock auth flow", async ({ unauthenticatedPage }) => {
  await login(unauthenticatedPage);

  await expect(
    unauthenticatedPage.getByRole("heading", { name: /dashboard overview/i }),
  ).toBeVisible();
});

test("signs in through the password form", async ({ unauthenticatedPage }) => {
  await unauthenticatedPage.goto("/login");

  await unauthenticatedPage.getByRole("button", { name: /switch or remove account/i }).click();
  await unauthenticatedPage.getByLabel(/email/i).fill("avery@northstar.app");
  await unauthenticatedPage.getByLabel(/password/i).fill("supersecret");
  await unauthenticatedPage.getByRole("button", { name: /^sign in$/i }).click();

  await expect(
    unauthenticatedPage.getByRole("heading", { name: /dashboard overview/i }),
  ).toBeVisible();
});
