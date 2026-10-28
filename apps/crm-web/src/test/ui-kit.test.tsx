import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const seed = () =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

describe("ui kit page", () => {
  it("renders the foundations panel by default", async () => {
    seed();
    renderApp({ initialEntries: ["/app/ui"] });

    expect(await screen.findByRole("heading", { name: /ui kit/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /foundations/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("heading", { name: /color tokens/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /typography/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^--/).length).toBeGreaterThanOrEqual(8);
  });

  it("switches panels and shows the component sections", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/ui"] });
    await screen.findByRole("heading", { name: /ui kit/i, level: 1 });

    await user.click(screen.getByRole("tab", { name: /components/i }));
    expect(screen.getByRole("tab", { name: /components/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("heading", { name: /^buttons$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /badges/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /alerts/i })).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(4);
  });

  it("fires a toast when a button variant is clicked", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/ui"] });
    await screen.findByRole("tab", { name: /components/i });

    await user.click(screen.getByRole("tab", { name: /components/i }));
    await user.click(screen.getByRole("button", { name: /^outline$/i }));
    expect(await screen.findByText(/outline button clicked/i)).toBeInTheDocument();
  });

  it("toggles the switch and counts input characters in the forms panel", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/ui"] });
    await screen.findByRole("tab", { name: /forms/i });

    await user.click(screen.getByRole("tab", { name: /forms/i }));
    const input = screen.getByLabelText(/company name/i);
    await user.clear(input);
    await user.type(input, "Acme");
    expect(screen.getByText(/4 characters/i)).toBeInTheDocument();

    const digest = screen.getByRole("switch", { name: /weekly digest/i });
    await user.click(digest);
    expect(digest).not.toBeChecked();
  });

  it("shows the tooltip on hover in the overlays panel", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/ui"] });
    await screen.findByRole("tab", { name: /overlays/i });

    await user.click(screen.getByRole("tab", { name: /overlays/i }));
    await user.hover(screen.getByRole("button", { name: /hover for tooltip/i }));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  });

  it("renders the feedback panel with toasts and skeletons", async () => {
    const user = userEvent.setup();
    seed();
    renderApp({ initialEntries: ["/app/ui"] });
    await screen.findByRole("tab", { name: /feedback/i });

    await user.click(screen.getByRole("tab", { name: /feedback/i }));
    expect(screen.getByRole("heading", { name: /skeletons/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /success toast/i }));
    expect(await screen.findByText(/changes saved/i)).toBeInTheDocument();
  });
});
