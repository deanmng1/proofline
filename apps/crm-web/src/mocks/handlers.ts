import { delay, HttpResponse, http } from "msw";
import {
  analyticsPayload,
  apiKeysPayload,
  billingPayload,
  calendarPayload,
  defaultSession,
  integrationsPayload,
  mailPayload,
  notificationsPayload,
  overviewPayload,
  profilePayload,
  settingsPayload,
  supportPayload,
  teamPayload,
  tenantsPayload,
  transactionsPayload,
  usersPayload,
} from "@/mocks/data";
import type {
  ApiKey,
  BillingPayload,
  CalendarEvent,
  Integration,
  MailMessage,
  NotificationItem,
  SettingsPayload,
  TeamMember,
  Tenant,
  Ticket,
  UserRecord,
} from "@/types";

let activeSession = defaultSession;
let activeSettings = settingsPayload;
let activeNotifications: NotificationItem[] = notificationsPayload;
let activeTeam: TeamMember[] = teamPayload;
let activeIntegrations: Integration[] = integrationsPayload;
let activeApiKeys: ApiKey[] = apiKeysPayload;
let activeTickets: Ticket[] = supportPayload;
let activeBilling: BillingPayload = billingPayload;
let activeTenants: Tenant[] = tenantsPayload;
let activeMail: MailMessage[] = mailPayload;
let activeCalendar: CalendarEvent[] = calendarPayload;

export const resetMockState = () => {
  activeSession = defaultSession;
  activeSettings = settingsPayload;
  activeNotifications = notificationsPayload;
  activeTeam = teamPayload;
  activeIntegrations = integrationsPayload;
  activeApiKeys = apiKeysPayload;
  activeTickets = supportPayload;
  activeBilling = billingPayload;
  activeTenants = tenantsPayload;
  activeMail = mailPayload;
  activeCalendar = calendarPayload;
};

const readQuery = (request: Request, key: string) =>
  new URL(request.url).searchParams.get(key)?.toLowerCase() ?? "";

export const handlers = [
  // Auth
  http.get("/api/auth/session", async () => {
    await delay(250);
    return HttpResponse.json(activeSession);
  }),
  http.post("/api/auth/login", async () => {
    await delay(450);
    activeSession = defaultSession;
    return HttpResponse.json(activeSession);
  }),
  http.post("/api/auth/logout", async () => {
    await delay(120);
    activeSession = { ...defaultSession, isAuthenticated: false };
    return HttpResponse.json({ success: true });
  }),
  http.post("/api/auth/refresh", async () => {
    await delay(300);
    activeSession = {
      ...defaultSession,
      accessToken: "mock-access-token-refreshed",
      expiresAt: Date.now() + 1000 * 60 * 60,
    };
    return HttpResponse.json(activeSession);
  }),

  // Dashboard
  http.get("/api/dashboard/overview", async () => {
    await delay(320);
    return HttpResponse.json(overviewPayload);
  }),
  http.get("/api/users", async ({ request }) => {
    await delay(260);
    const search = readQuery(request, "search");
    if (!search) {
      return HttpResponse.json(usersPayload);
    }
    return HttpResponse.json(
      usersPayload.filter((user) => {
        const haystack = `${user.name} ${user.email} ${user.role}`.toLowerCase();
        return haystack.includes(search);
      }),
    );
  }),
  http.post("/api/users/invite", async ({ request }) => {
    await delay(320);
    const body = (await request.json()) as { name: string; email: string; role: string };
    const allowed = ["Owner", "Admin", "Support", "Analyst"] as const;
    const role = (allowed as readonly string[]).includes(body.role)
      ? (body.role as UserRecord["role"])
      : "Analyst";
    const nextId = `usr_${String(usersPayload.length + 1).padStart(3, "0")}`;
    const invited: UserRecord = {
      id: nextId,
      name: body.name,
      email: body.email,
      role,
      status: "Invited",
      lastActiveAt: "Never",
    };
    usersPayload.push(invited);
    return HttpResponse.json(invited, { status: 201 });
  }),
  http.patch("/api/users/:id", async ({ params, request }) => {
    await delay(240);
    const { id } = params;
    const body = (await request.json()) as { status?: string };
    const user = usersPayload.find((entry) => entry.id === id);
    if (!user) {
      return HttpResponse.json({ message: "User not found" }, { status: 404 });
    }
    if (body.status === "Active" || body.status === "Paused") {
      user.status = body.status;
    }
    return HttpResponse.json(user);
  }),
  http.get("/api/settings", async () => {
    await delay(220);
    return HttpResponse.json(activeSettings);
  }),
  http.patch("/api/settings", async ({ request }) => {
    await delay(420);
    const updates = (await request.json()) as SettingsPayload;
    activeSettings = updates;
    return HttpResponse.json(activeSettings);
  }),

  // Billing & Plans
  http.get("/api/billing", async () => {
    await delay(280);
    return HttpResponse.json(activeBilling);
  }),
  http.post("/api/billing/subscriptions", async ({ request }) => {
    await delay(380);
    const { planId } = (await request.json()) as { planId: string };
    const plan = activeBilling.plans.find((entry) => entry.id === planId);
    if (!plan) {
      return new HttpResponse(null, { status: 404 });
    }
    activeBilling = {
      ...activeBilling,
      subscription: {
        ...activeBilling.subscription,
        planId: plan.id,
        planName: plan.name,
        seatsTotal: plan.seats,
        usagePercent: Math.round((activeBilling.subscription.seatsUsed / plan.seats) * 100),
      },
    };
    return HttpResponse.json(activeBilling.subscription);
  }),

  // Analytics & Reports
  http.get("/api/analytics/summary", async () => {
    await delay(300);
    return HttpResponse.json(analyticsPayload);
  }),

  // Team & Roles
  http.get("/api/team", async ({ request }) => {
    await delay(240);
    const search = readQuery(request, "search");
    if (!search) {
      return HttpResponse.json(activeTeam);
    }
    return HttpResponse.json(
      activeTeam.filter((member) =>
        `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(search),
      ),
    );
  }),
  http.post("/api/team/invite", async ({ request }) => {
    await delay(360);
    const next = (await request.json()) as {
      name: string;
      email: string;
      role: TeamMember["role"];
    };
    const member: TeamMember = {
      id: `tm_${Date.now()}`,
      name: next.name,
      email: next.email,
      role: next.role,
      status: "Invited",
      lastActiveAt: "Pending invite",
    };
    activeTeam = [member, ...activeTeam];
    return HttpResponse.json(member);
  }),
  http.patch("/api/team/:id", async ({ params, request }) => {
    await delay(280);
    const { id } = params as { id: string };
    const { role } = (await request.json()) as { role: TeamMember["role"] };
    activeTeam = activeTeam.map((member) => (member.id === id ? { ...member, role } : member));
    return HttpResponse.json(activeTeam.find((member) => member.id === id));
  }),
  http.delete("/api/team/:id", async ({ params }) => {
    await delay(220);
    const { id } = params as { id: string };
    activeTeam = activeTeam.filter((member) => member.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),

  // Notifications
  http.get("/api/notifications", async () => {
    await delay(220);
    return HttpResponse.json(activeNotifications);
  }),
  http.patch("/api/notifications/:id/read", async ({ params }) => {
    await delay(160);
    const { id } = params as { id: string };
    activeNotifications = activeNotifications.map((item) =>
      item.id === id ? { ...item, read: true } : item,
    );
    return HttpResponse.json(activeNotifications.find((item) => item.id === id));
  }),
  http.post("/api/notifications/read-all", async () => {
    await delay(200);
    activeNotifications = activeNotifications.map((item) => ({ ...item, read: true }));
    return HttpResponse.json(activeNotifications);
  }),

  // Transactions
  http.get("/api/transactions", async ({ request }) => {
    await delay(260);
    const status = readQuery(request, "status");
    const search = readQuery(request, "search");
    return HttpResponse.json(
      transactionsPayload.filter((txn) => {
        const matchesStatus = !status || txn.status === status;
        const matchesSearch =
          !search ||
          `${txn.customer} ${txn.email} ${txn.status} ${txn.method}`.toLowerCase().includes(search);
        return matchesStatus && matchesSearch;
      }),
    );
  }),

  // Integrations & API keys
  http.get("/api/integrations", async () => {
    await delay(240);
    return HttpResponse.json(activeIntegrations);
  }),
  http.post("/api/integrations/:id/connect", async ({ params }) => {
    await delay(320);
    const { id } = params as { id: string };
    activeIntegrations = activeIntegrations.map((integration) =>
      integration.id === id
        ? {
            ...integration,
            status: "connected",
            connectedAt: new Date().toISOString().slice(0, 10),
          }
        : integration,
    );
    return HttpResponse.json(activeIntegrations.find((integration) => integration.id === id));
  }),
  http.get("/api/integrations/api-keys", async () => {
    await delay(220);
    return HttpResponse.json(activeApiKeys);
  }),
  http.post("/api/integrations/api-keys", async ({ request }) => {
    await delay(340);
    const next = (await request.json()) as { label: string; scopes: string[] };
    const key: ApiKey = {
      id: `key_${Date.now()}`,
      label: next.label,
      prefix: `sk_live_${Math.random().toString(36).slice(2, 6)}`,
      scopes: next.scopes,
      createdAt: new Date().toISOString().slice(0, 10),
      lastUsedAt: "Never",
      revoked: false,
    };
    activeApiKeys = [key, ...activeApiKeys];
    return HttpResponse.json(key);
  }),
  http.delete("/api/integrations/api-keys/:id", async ({ params }) => {
    await delay(220);
    const { id } = params as { id: string };
    activeApiKeys = activeApiKeys.map((key) => (key.id === id ? { ...key, revoked: true } : key));
    return new HttpResponse(null, { status: 204 });
  }),

  // Support & Feedback
  http.get("/api/support/tickets", async ({ request }) => {
    await delay(260);
    const status = readQuery(request, "status");
    const priority = readQuery(request, "priority");
    return HttpResponse.json(
      supportPayload.filter((ticket) => {
        const matchesStatus = !status || ticket.status === status;
        const matchesPriority = !priority || ticket.priority === priority;
        return matchesStatus && matchesPriority;
      }),
    );
  }),
  http.post("/api/support/tickets", async ({ request }) => {
    await delay(360);
    const next = (await request.json()) as {
      subject: string;
      requester: string;
      priority: Ticket["priority"];
    };
    const ticket: Ticket = {
      id: `tkt_${Date.now()}`,
      subject: next.subject,
      requester: next.requester,
      priority: next.priority,
      status: "open",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    activeTickets = [ticket, ...activeTickets];
    return HttpResponse.json(ticket);
  }),
  http.patch("/api/support/tickets/:id", async ({ params, request }) => {
    await delay(280);
    const { id } = params as { id: string };
    const { status } = (await request.json()) as { status: Ticket["status"] };
    activeTickets = activeTickets.map((ticket) =>
      ticket.id === id ? { ...ticket, status } : ticket,
    );
    return HttpResponse.json(activeTickets.find((ticket) => ticket.id === id));
  }),

  // Tenants
  http.get("/api/tenants", async () => {
    await delay(200);
    return HttpResponse.json(activeTenants);
  }),
  http.get("/api/tenants/:id", async ({ params }) => {
    await delay(160);
    const { id } = params as { id: string };
    const tenant = activeTenants.find((entry) => entry.id === id);
    if (!tenant) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(tenant);
  }),
  http.put("/api/tenants/:id", async ({ params, request }) => {
    await delay(240);
    const { id } = params as { id: string };
    const updates = (await request.json()) as Partial<Tenant>;
    activeTenants = activeTenants.map((tenant) =>
      tenant.id === id ? { ...tenant, ...updates } : tenant,
    );
    return HttpResponse.json(activeTenants.find((tenant) => tenant.id === id));
  }),

  // Mail
  http.get("/api/mail", async ({ request }) => {
    await delay(260);
    const folder = readQuery(request, "folder") === "sent" ? "sent" : "inbox";
    return HttpResponse.json(activeMail.filter((message) => message.folder === folder));
  }),
  http.patch("/api/mail/:id/read", async ({ params, request }) => {
    await delay(140);
    const { id } = params as { id: string };
    const body = (await request.json().catch(() => ({}))) as { read?: boolean };
    const read = body.read ?? true;
    activeMail = activeMail.map((message) => (message.id === id ? { ...message, read } : message));
    return HttpResponse.json({ success: true });
  }),

  // Calendar
  http.get("/api/calendar", async ({ request }) => {
    await delay(240);
    const month = readQuery(request, "month");
    const events = month
      ? activeCalendar.filter((event) => event.date.startsWith(month))
      : activeCalendar;
    return HttpResponse.json(events);
  }),

  // Profile
  http.get("/api/profile", async () => {
    await delay(220);
    return HttpResponse.json(profilePayload);
  }),
];
