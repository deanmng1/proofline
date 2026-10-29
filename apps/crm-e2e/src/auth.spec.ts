import { expect, test } from "./fixtures/test";
import { login } from "./helpers";

test("signs in through the routed auth flow", async ({ unauthenticatedPage }) => {
  await login(unauthenticatedPage, "/app/overview");

  await expect(
    unauthenticatedPage.getByRole("heading", { name: /dashboard overview/i }),
  ).toBeVisible();
});

test("signs in through the password form", async ({ unauthenticatedPage }) => {
  await login(unauthenticatedPage, "/app/overview");

  await expect(
    unauthenticatedPage.getByRole("heading", { name: /dashboard overview/i }),
  ).toBeVisible();
});
