import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";
import type { Session } from "@/types";

const managerSession: Session = {
  user: {
    id: "m1",
    name: "Dana Manager",
    email: "dana@northstar.app",
    role: "Manager",
    organization: "Northstar",
  },
  isAuthenticated: true,
  accessToken: "mock-access-token",
  expiresAt: 4102444800000,
};

const seed = (session: Session) =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(session));

describe("role-based access control", () => {
  it("shows every nav item for an Owner session", async () => {
    const user = userEvent.setup();
    seed(defaultSession);
    renderApp({ initialEntries: ["/app/overview"] });

    await screen.findByRole("button", { name: /finance/i });
    await user.click(screen.getByRole("button", { name: /finance/i }));
    await user.click(screen.getByRole("button", { name: /people/i }));

    expect(screen.getByRole("link", { name: /billing/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /integrations/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /team/i })).toBeInTheDocument();
  });

  it("hides role-restricted nav items for a Manager session", async () => {
    const user = userEvent.setup();
    seed(managerSession);
    renderApp({ initialEntries: ["/app/overview"] });

    await screen.findByText(/dashboard overview/i);
    await user.click(screen.getByRole("button", { name: /finance/i }));
    await user.click(screen.getByRole("button", { name: /people/i }));

    expect(screen.queryByRole("link", { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /integrations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /team/i })).not.toBeInTheDocument();
  });

  it("redirects a Manager away from a restricted route", async () => {
    seed(managerSession);
    renderApp({ initialEntries: ["/app/billing"] });

    expect(await screen.findByText(/dashboard overview/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /plans, usage and invoices/i }),
    ).not.toBeInTheDocument();
  });

  it("allows an Owner to reach a restricted route", async () => {
    seed(defaultSession);
    renderApp({ initialEntries: ["/app/billing"] });

    expect(
      await screen.findByRole("heading", { name: /plans, usage and invoices/i }),
    ).toBeInTheDocument();
  });
});
