import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { StatePanel } from "@/components/shared/state-panel";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { RoleRoute } from "@/features/auth/role-route";

const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({ default: module.LoginPage })),
);
const OverviewPage = lazy(() =>
  import("@/pages/overview-page").then((module) => ({ default: module.OverviewPage })),
);
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics-page").then((module) => ({ default: module.AnalyticsPage })),
);
const UsersPage = lazy(() =>
  import("@/pages/users-page").then((module) => ({ default: module.UsersPage })),
);
const TeamPage = lazy(() =>
  import("@/pages/team-page").then((module) => ({ default: module.TeamPage })),
);
const BillingPage = lazy(() =>
  import("@/pages/billing-page").then((module) => ({ default: module.BillingPage })),
);
const TransactionsPage = lazy(() =>
  import("@/pages/transactions-page").then((module) => ({ default: module.TransactionsPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/notifications-page").then((module) => ({ default: module.NotificationsPage })),
);
const MailPage = lazy(() =>
  import("@/pages/mail-page").then((module) => ({ default: module.MailPage })),
);
const CalendarPage = lazy(() =>
  import("@/pages/calendar-page").then((module) => ({ default: module.CalendarPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/profile-page").then((module) => ({ default: module.ProfilePage })),
);
const UiKitPage = lazy(() =>
  import("@/pages/ui-kit-page").then((module) => ({ default: module.UiKitPage })),
);
const DataTablesPage = lazy(() =>
  import("@/pages/data-tables-page").then((module) => ({ default: module.DataTablesPage })),
);
const DataChartsPage = lazy(() =>
  import("@/pages/data-charts-page").then((module) => ({ default: module.DataChartsPage })),
);
const SupportPage = lazy(() =>
  import("@/pages/support-page").then((module) => ({ default: module.SupportPage })),
);
const IntegrationsPage = lazy(() =>
  import("@/pages/integrations-page").then((module) => ({ default: module.IntegrationsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })),
);
const UserSettingsPage = lazy(() =>
  import("@/pages/user-settings-page").then((module) => ({ default: module.UserSettingsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then((module) => ({ default: module.NotFoundPage })),
);

const RouteFallback = () => (
  <div className="px-4 py-6">
    <StatePanel kind="loading" title="Loading route" description="Preparing the dashboard view." />
  </div>
);

export const AppRouter = () => (
  <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/app/overview" element={<OverviewPage />} />
          <Route path="/app/analytics" element={<AnalyticsPage />} />
          <Route path="/app/mail" element={<MailPage />} />
          <Route path="/app/mail/sent" element={<MailPage />} />
          <Route path="/app/calendar" element={<CalendarPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
          <Route path="/app/404" element={<NotFoundPage embedded />} />
          <Route path="/app/ui" element={<UiKitPage />} />
          <Route path="/app/data/tables" element={<DataTablesPage />} />
          <Route path="/app/data/charts" element={<DataChartsPage />} />
          <Route
            path="/app/users"
            element={
              <RoleRoute roles={["Owner", "Admin", "Manager"]}>
                <UsersPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/team"
            element={
              <RoleRoute roles={["Owner", "Admin"]}>
                <TeamPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/billing"
            element={
              <RoleRoute roles={["Owner", "Admin"]}>
                <BillingPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/transactions"
            element={
              <RoleRoute roles={["Owner", "Admin", "Manager"]}>
                <TransactionsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/notifications"
            element={
              <RoleRoute roles={["Owner", "Admin", "Manager"]}>
                <NotificationsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/support"
            element={
              <RoleRoute roles={["Owner", "Admin", "Manager"]}>
                <SupportPage />
              </RoleRoute>
            }
          />
          <Route
            path="/app/integrations"
            element={
              <RoleRoute roles={["Owner", "Admin"]}>
                <IntegrationsPage />
              </RoleRoute>
            }
          />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="/app/settings/user" element={<UserSettingsPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/app/overview" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);
