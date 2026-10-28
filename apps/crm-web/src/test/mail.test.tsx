import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultSession } from "@/mocks/data";
import { renderApp } from "@/test/test-app";

const seed = () =>
  window.localStorage.setItem("admin-dashboard-template:session", JSON.stringify(defaultSession));

describe("mail module", () => {
  beforeEach(() => {
    seed();
  });

  it("renders inbox messages from the mock endpoint", async () => {
    renderApp({ initialEntries: ["/app/mail"] });

    expect(await screen.findByRole("heading", { name: /inbox/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/your scale plan renews/i)).toBeInTheDocument();
    expect(screen.getByText(/6 messages/i)).toBeInTheDocument();
  });

  it("opens a message in the reader and marks it read", async () => {
    const user = userEvent.setup();
    renderApp({ initialEntries: ["/app/mail"] });

    const unread = await screen.findByRole("button", { name: /your scale plan renews/i });
    await user.click(unread);

    expect(
      await screen.findByRole("heading", { name: /your scale plan renews/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/2 unread/i)).toBeInTheDocument());
  });

  it("shows the sent folder under the mail subsection", async () => {
    renderApp({ initialEntries: ["/app/mail/sent"] });

    expect(await screen.findByRole("heading", { name: /sent/i, level: 1 })).toBeInTheDocument();
    expect((await screen.findAllByText(/q3 roadmap draft/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/4 messages/i)).toBeInTheDocument();
  });
});
