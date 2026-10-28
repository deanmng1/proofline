import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { defaultSession } from "@/mocks/data";
import { server } from "@/test/server";
import { renderApp } from "@/test/test-app";

const REMEMBERED_KEY = "admin-dashboard-template:last-user";

const rememberAlex = () =>
  window.localStorage.setItem(
    REMEMBERED_KEY,
    JSON.stringify({ name: "Alex Chen", email: "alex.chen@company.com" }),
  );

describe("login screen", () => {
  it("falls back to the demo persona when no account is remembered", async () => {
    renderApp({ initialEntries: ["/login"] });

    expect(
      await screen.findByRole("button", { name: /continue as avery stone/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("avery@northstar.app")).toBeInTheDocument();
  });

  it("renders the remembered account from local storage", async () => {
    rememberAlex();
    renderApp({ initialEntries: ["/login"] });

    expect(
      await screen.findByRole("button", { name: /continue as alex chen/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("alex.chen@company.com")).toBeInTheDocument();
  });

  it("signs in through the remembered account and reaches the overview", async () => {
    const user = userEvent.setup();
    renderApp({ initialEntries: ["/login"] });

    await user.click(await screen.findByRole("button", { name: /continue as avery stone/i }));

    expect(
      await screen.findByText(/dashboard overview/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("honors the redirect target carried by protected routes", async () => {
    const user = userEvent.setup();
    renderApp({ initialEntries: ["/app/users"] });

    await user.click(await screen.findByRole("button", { name: /continue as avery stone/i }));

    expect(
      await screen.findByText(/access control and roster visibility/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("switches to the password form, validates input and signs in", async () => {
    const user = userEvent.setup();
    rememberAlex();
    renderApp({ initialEntries: ["/login"] });

    await user.click(await screen.findByRole("button", { name: /switch or remove account/i }));

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/enter your email address\.?/i)).toBeInTheDocument();

    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/password/i);
    await user.type(email, "not-an-email");
    await user.type(password, "short");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/enter a valid email address\.?/i)).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, "alex@company.com");
    await user.clear(password);
    await user.type(password, "supersecret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(
      await screen.findByText(/dashboard overview/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("removes the saved account and pins the password form", async () => {
    const user = userEvent.setup();
    rememberAlex();
    renderApp({ initialEntries: ["/login"] });

    await user.click(await screen.findByRole("button", { name: /switch or remove account/i }));
    await user.click(screen.getByRole("button", { name: /remove saved account/i }));

    expect(window.localStorage.getItem(REMEMBERED_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: /use saved account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue as/i })).not.toBeInTheDocument();
  });

  it("sends the provider method for social sign-in buttons", async () => {
    let method: string | undefined;
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        const body = (await request.json()) as { method?: string };
        method = body.method;
        return HttpResponse.json(defaultSession);
      }),
    );
    const user = userEvent.setup();
    renderApp({ initialEntries: ["/login"] });

    await user.click(await screen.findByRole("button", { name: /google/i }));

    expect(method).toBe("google");
    expect(
      await screen.findByText(/dashboard overview/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
