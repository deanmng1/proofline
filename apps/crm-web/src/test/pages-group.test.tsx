import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const seed = () =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

describe("pages group", () => {
  it("renders the profile from the mock endpoint", async () => {
    seed();
    renderApp({ initialEntries: ["/app/profile"] });

    expect(
      await screen.findByRole("heading", { name: /your profile/i, level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/avery@northstar\.app/i)).toBeInTheDocument();
    expect(screen.getByText(/march 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/america\/new_york/i)).toBeInTheDocument();
    expect(screen.getByText(/invited sandra lee/i)).toBeInTheDocument();
  });

  it("renders the 404 demo inside the app shell", async () => {
    seed();
    renderApp({ initialEntries: ["/app/404"] });

    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to dashboard/i })).toBeInTheDocument();
  });
});
