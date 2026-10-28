import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/app/error-boundary";
import { resolveNavTrail } from "@/components/layout/nav-items";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Topbar } from "@/components/layout/topbar";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { cn } from "@/lib/utils";

export const AppShell = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const pageKey = useMemo(
    () => location.pathname.split("/").at(-1) ?? "overview",
    [location.pathname],
  );

  useEffect(() => {
    const trail = resolveNavTrail(location.pathname);
    const pageTitle = t(trail?.child?.title ?? trail?.item.title ?? "nav.overview");
    document.title = `${pageTitle} · Admin Dash`;
    setAnnouncement(pageTitle);

    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("#main-content h1");
      heading?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, t]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-50 -translate-y-24 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] shadow-[var(--shadow-card)] transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      >
        {t("common.skipToMain")}
      </a>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement ? `${announcement} page loaded` : ""}
      </div>
      <SidebarNav collapsed={collapsed} />
      <main
        id="main-content"
        className={cn(
          "min-h-screen px-3 py-3 transition-[padding] pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4 md:py-4 lg:pl-[19rem]",
          collapsed && "lg:pl-[8rem]",
        )}
      >
        <div className="mx-auto max-w-7xl space-y-5 md:space-y-6">
          <Topbar collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
          <div key={pageKey} className="animate-[fade-in_320ms_ease] space-y-4">
            <Breadcrumbs />
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
};
