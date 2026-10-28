import { screen } from "@testing-library/react";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const routes: { path: string; heading: RegExp }[] = [
  { path: "/app/analytics", heading: /reports and product health/i },
  { path: "/app/team", heading: /members, roles and access/i },
  { path: "/app/billing", heading: /plans, usage and invoices/i },
  { path: "/app/transactions", heading: /payments and charges/i },
  { path: "/app/notifications", heading: /alerts and in-app messages/i },
  { path: "/app/support", heading: /tickets and feedback/i },
  { path: "/app/integrations", heading: /connected apps and api keys/i },
];

describe("module pages", () => {
  it.each(routes)("renders %s", async ({ path, heading }) => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    renderApp({ initialEntries: [path] });
    expect(
      await screen.findByRole("heading", { name: heading }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("renders overview bottom zone from live mock endpoints", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    renderApp({ initialEntries: ["/app/overview"] });

    expect(await screen.findByText(/q2 expansion won/i)).toBeInTheDocument();
    expect(await screen.findByText(/northstar labs/i)).toBeInTheDocument();
    expect(screen.getByText(/latest payments from the ledger/i)).toBeInTheDocument();
  });
});
