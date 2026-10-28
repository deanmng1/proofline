import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const seed = () =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

describe("data gallery", () => {
  it("renders the transactions table with sorting and a detail drawer", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/data/tables"] });

    expect((await screen.findAllByText(/northstar labs/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /customer/i }));
    const firstBodyRow = screen.getAllByRole("row")[1];
    expect(firstBodyRow).toHaveTextContent(/aperture/i);

    await user.click(screen.getAllByRole("cell", { name: /northstar labs/i })[0]);
    const drawer = await screen.findByRole("dialog", { name: /northstar labs/i });
    expect(within(drawer).getByText(/transaction id/i)).toBeInTheDocument();
  });

  it("filters transactions with status chips", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/data/tables"] });
    await screen.findByText(/granite ops/i);

    await user.click(screen.getByRole("button", { name: /^pending$/i }));
    expect(await screen.findByText(/1 visible/i)).toBeInTheDocument();
  });

  it("renders the chart gallery with accessible alternatives", async () => {
    seed();
    renderApp({ initialEntries: ["/app/data/charts"] });

    expect(
      await screen.findByRole("heading", { name: /area — monthly revenue/i }),
    ).toBeInTheDocument();
    for (const heading of [
      /line — mrr trend/i,
      /bar — channel performance/i,
      /donut — funnel stages/i,
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("table", { hidden: true }).length).toBeGreaterThanOrEqual(4);
  });
});
