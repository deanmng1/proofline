import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

describe("theme switching", () => {
  it("applies and persists each available theme from user settings", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    renderApp({ initialEntries: ["/app/settings/user"] });

    await screen.findByRole("heading", { name: /personalize your experience/i });

    const themes: [string, string][] = [
      ["Midnight Ops", "midnight-ops"],
      ["Sunset Ember", "sunset-ember"],
      ["Forest Deep", "forest-deep"],
      ["Core Light", "oneui-ash"],
    ];

    for (const [label, id] of themes) {
      await user.click(screen.getByRole("radio", { name: new RegExp(label, "i") }));
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe(id));
      await waitFor(() => expect(window.localStorage.getItem("admin-dashboard-theme")).toBe(id));
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: new RegExp(label, "i") })).toBeChecked(),
      );
    }
  });
});
