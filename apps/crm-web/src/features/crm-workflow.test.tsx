import { createMswHandlers, createTestApi } from "@testbed/api-contracts";
import { ledgerSeed, renderWithProviders } from "@testbed/test-kit";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test } from "vitest";

import { CustomerListPage } from "@/features/customers/customer-list-page";
import { PolicyDetailPage } from "@/features/policies/policy-detail-page";
import { QuoteForm } from "@/features/quotes/quote-form";
import { server } from "@/test/server";

function useTestApi() {
  const api = createTestApi(ledgerSeed(), { now: "2026-01-01T00:00:00.000Z" });
  server.use(...createMswHandlers(api));
  return api;
}

describe("insurance CRM reference workflow", () => {
  test("lets an agent choose Risk Secure Plus, bind it once, and see the cash-first timing", async () => {
    useTestApi();
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm />);

    await screen.findByRole("option", { name: /100 Market Street/i });
    await user.selectOptions(screen.getByLabelText("Policyholder"), "fixture-customer-1");
    await user.selectOptions(screen.getByLabelText("Insured property"), "fixture-property-1");
    await user.selectOptions(screen.getByLabelText("Product"), "risk_secure_plus");
    await user.clear(screen.getByLabelText("Premium in cents"));
    await user.type(screen.getByLabelText("Premium in cents"), "10000");
    await user.click(screen.getByRole("button", { name: "Create quote" }));

    expect(
      (await screen.findAllByText("Cash-first: 10% as premium is paid")).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Bind quote" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "As earned — payable after 30 days",
    );
    expect(screen.getByRole("status")).toHaveTextContent("COM-002");
  });

  test("records a settled premium payment as an append-only ledger event", async () => {
    useTestApi();
    const user = userEvent.setup();
    renderWithProviders(<PolicyDetailPage policyId="fixture-policy-1" />);

    await screen.findByRole("heading", { name: "Policy fixture-policy-1" });
    expect(screen.getByText("quote created")).toBeVisible();
    expect(screen.getByText("quote bound")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Finance event"), "premium_payment_settled");
    await user.clear(screen.getByLabelText("Amount in cents"));
    await user.type(screen.getByLabelText("Amount in cents"), "2500");
    await user.click(screen.getByRole("button", { name: "Record finance event" }));

    expect(await screen.findByText("premium payment")).toBeVisible();
    expect(screen.getByText("$25.00")).toBeVisible();
    expect(screen.getByText("$2.50")).toBeVisible();
    expect(screen.getByText("COM-002")).toBeVisible();
  });

  test("shows an error panel when the customer contract fails", async () => {
    useTestApi();
    server.use(http.get("/api/customers", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<CustomerListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Customers unavailable");
  });
});
