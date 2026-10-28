import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const seed = () =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

const currentMonthLabel = () =>
  new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

describe("calendar module", () => {
  it("renders the current month with seeded events", async () => {
    seed();
    renderApp({ initialEntries: ["/app/calendar"] });

    expect(
      await screen.findByRole("heading", { name: /team calendar/i, level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: /calendar for/i })).toBeInTheDocument();
    expect(await screen.findByText(/sprint planning/i)).toBeInTheDocument();
  });

  it("navigates between months", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/calendar"] });
    await screen.findByText(/sprint planning/i);

    await user.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getAllByText(/\d+ scheduled event/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByText(new RegExp(currentMonthLabel(), "i"))).toBeInTheDocument();
  });
});
