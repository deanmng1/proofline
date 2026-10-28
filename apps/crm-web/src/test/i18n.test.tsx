import { screen } from "@testing-library/react";
import i18n from "@/features/i18n/i18n";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

describe("internationalization", () => {
  it("renders nav labels in English by default", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    renderApp({ initialEntries: ["/app/overview"] });
    const labels = await screen.findAllByText("Overview", {}, { timeout: 3000 });
    expect(labels.length).toBeGreaterThan(0);
  });

  it("switches visible UI strings to Spanish", async () => {
    window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));
    renderApp({ initialEntries: ["/app/overview"] });
    await screen.findAllByText("Overview", {}, { timeout: 3000 });

    await i18n.changeLanguage("es");

    const labels = await screen.findAllByText("Visión general");
    expect(labels.length).toBeGreaterThan(0);
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
  });
});
