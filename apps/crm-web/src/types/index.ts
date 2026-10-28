export type NavItem = {
  title: string;
  href?: string;
  icon: string;
  roles?: AppRole[];
  children?: NavItem[];
};

export type AppRole = "Owner" | "Admin" | "Manager";

export type Session = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "Owner" | "Admin" | "Manager";
    organization: string;
  };
  isAuthenticated: boolean;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type DashboardKpi = {
  id: string;
  label: string;
  value: number;
  change: number;
  tone: "positive" | "neutral";
  spark: number[];
};

export type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  at: string;
};

export type ChartPoint = {
  name: string;
  revenue: number;
  activeUsers: number;
};

export type OverviewPayload = {
  kpis: DashboardKpi[];
  activity: ActivityItem[];
  chart: ChartPoint[];
};

export type UserStatus = "Active" | "Invited" | "Paused";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Support" | "Analyst";
  status: UserStatus;
  lastActiveAt: string;
  avatarUrl?: string;
};

export type SettingsPayload = {
  profile: {
    companyName: string;
    contactEmail: string;
    timezone: string;
  };
  preferences: {
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
};

// Billing & Plans
export type PlanStatus = "active" | "past_due" | "canceled";
export type InvoiceStatus = "paid" | "open" | "void";

export type PlanTier = {
  id: string;
  name: string;
  priceMonthly: number;
  seats: number;
  features: string[];
  highlighted?: boolean;
};

export type Subscription = {
  planId: string;
  planName: string;
  status: PlanStatus;
  renewsAt: string;
  seatsUsed: number;
  seatsTotal: number;
  usagePercent: number;
};

export type Invoice = {
  id: string;
  number: string;
  issuedAt: string;
  amount: number;
  status: InvoiceStatus;
};

export type BillingPayload = {
  subscription: Subscription;
  plans: PlanTier[];
  invoices: Invoice[];
};

// Analytics & Reports
export type FunnelStep = { stage: string; value: number };
export type ChannelPerf = { channel: string; visitors: number; conversions: number };
export type CohortRow = { cohort: string; retention: number[] };

export type AnalyticsPayload = {
  funnel: FunnelStep[];
  channels: ChannelPerf[];
  cohorts: CohortRow[];
  mrr: ChartPoint[];
};

// Team & Roles
export type TeamRole = "Owner" | "Admin" | "Member" | "Billing";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: UserStatus;
  lastActiveAt: string;
};

// Notifications
export type NotificationLevel = "info" | "success" | "warning";
export type NotificationChannel = "email" | "in-app" | "sms";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  level: NotificationLevel;
  triggeredAt: string;
  read: boolean;
};

// Transactions
export type TransactionStatus = "succeeded" | "pending" | "failed" | "refunded";
export type PaymentMethod = "card" | "ach" | "paypal";

export type Transaction = {
  id: string;
  customer: string;
  email: string;
  date: string;
  amount: number;
  status: TransactionStatus;
  method: PaymentMethod;
};

// Integrations & API keys
export type IntegrationStatus = "connected" | "available";

export type Integration = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: IntegrationStatus;
  connectedAt?: string;
};

export type ApiKey = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string;
  revoked: boolean;
};

// Support & Feedback
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "pending" | "closed";

export type Ticket = {
  id: string;
  subject: string;
  requester: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  assignee?: string;
};

// Profile
export type UserProfile = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "Owner" | "Admin" | "Manager";
    organization: string;
  };
  memberSince: string;
  timezone: string;
  activity: ActivityItem[];
};

// Calendar
export type CalendarTone = "accent" | "success" | "warning" | "neutral";

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  time: string;
  tone: CalendarTone;
};

// Mail
export type MailFolder = "inbox" | "sent";

export type MailMessage = {
  id: string;
  folder: MailFolder;
  from: string;
  to: string;
  subject: string;
  preview: string;
  body: string;
  receivedAt: string;
  read: boolean;
};

// Multi-tenancy
export type TenantPlan = "starter" | "scale" | "enterprise";
export type TenantStatus = "active" | "suspended" | "trial";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  logoUrl?: string;
};
