import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

describe("user settings", () => {
  it("renders personalization sections and session identity", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

    renderApp({ initialEntries: ["/app/settings/user"] });

    expect(
      await screen.findByRole("heading", { name: /personalize your experience/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    expect(screen.getAllByText(/avery stone/i).length).toBeGreaterThan(0);
  });

  it("applies and persists a palette selection", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

    renderApp({ initialEntries: ["/app/settings/user"] });

    await screen.findByRole("heading", { name: /personalize your experience/i });
    await user.click(screen.getByRole("radio", { name: /midnight ops/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("midnight-ops");
      expect(window.localStorage.getItem("admin-dashboard-theme")).toBe("midnight-ops");
    });
  });

  it("switches the interface language from the language picker", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

    renderApp({ initialEntries: ["/app/settings/user"] });

    await screen.findByRole("heading", { name: /personalize your experience/i });
    await user.click(screen.getByRole("radio", { name: /español/i }));

    expect(await screen.findByRole("link", { name: /visión general/i })).toBeInTheDocument();
  });
});
