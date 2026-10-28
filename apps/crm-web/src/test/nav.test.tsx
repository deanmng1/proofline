import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { navLeafItems, resolveNavTrail } from "@/components/layout/nav-items";
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

const seed = (session: Session = defaultSession) =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(session));

describe("navigation information architecture", () => {
  it("exposes leaf items for search regardless of nesting", () => {
    const hrefs = navLeafItems.map((item) => item.href);
    expect(hrefs).toContain("/app/users");
    expect(hrefs).toContain("/app/settings/user");
    expect(hrefs).not.toContain(undefined);
  });

  it("resolves trails through section parents", () => {
    const trail = resolveNavTrail("/app/team");
    expect(trail?.group.label).toBe("nav.group.pages");
    expect(trail?.item.title).toBe("nav.people");
    expect(trail?.child?.title).toBe("nav.team");
  });

  it("resolves the longest href match for nested routes", () => {
    expect(resolveNavTrail("/app/settings/user")?.item.title).toBe("nav.userSettings");
    expect(resolveNavTrail("/app/settings")?.item.title).toBe("nav.settings");
  });

  it("keeps sections collapsed unless their subtree is active", async () => {
    seed();
    renderApp({ initialEntries: ["/app/overview"] });

    expect(await screen.findByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /people/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: /users/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finance/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("auto-expands the active trail and toggles on click", async () => {
    seed();
    const user = userEvent.setup();
    renderApp({ initialEntries: ["/app/users"] });

    const people = await screen.findByRole("button", { name: /people/i });
    expect(people).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /users/i })).toBeInTheDocument();

    await user.click(people);
    expect(people).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /users/i })).not.toBeInTheDocument();

    await user.click(people);
    expect(screen.getByRole("link", { name: /users/i })).toBeInTheDocument();
  });

  it("hides restricted children for a Manager while keeping allowed ones", async () => {
    seed(managerSession);
    renderApp({ initialEntries: ["/app/overview"] });

    expect(await screen.findByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /people/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /team/i })).not.toBeInTheDocument();

    const finance = screen.getByRole("button", { name: /finance/i });
    await userEvent.setup().click(finance);
    expect(screen.getByRole("link", { name: /transactions/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /billing/i })).not.toBeInTheDocument();
  });

  it("renders breadcrumbs for nested routes with the current page last", async () => {
    seed();
    renderApp({ initialEntries: ["/app/team"] });

    const breadcrumb = await screen.findByRole("navigation", { name: /breadcrumb/i });
    const items = within(breadcrumb).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/pages/i);
    expect(within(items[1]).getByRole("link", { name: /people/i })).toHaveAttribute(
      "href",
      "/app/users",
    );
    expect(within(items[2]).getByText(/team/i)).toHaveAttribute("aria-current", "page");
  });

  it("renders two-level breadcrumbs for flat pages", async () => {
    seed();
    renderApp({ initialEntries: ["/app/overview"] });

    const breadcrumb = await screen.findByRole("navigation", { name: /breadcrumb/i });
    const items = within(breadcrumb).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[1]).getByText(/overview/i)).toHaveAttribute("aria-current", "page");
  });
});
