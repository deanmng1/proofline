import { useTranslation } from "react-i18next";
import { NavGroupList } from "@/components/layout/nav-group-list";
import { filterNavGroupsByRole, navGroups } from "@/components/layout/nav-items";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

export const SidebarNav = ({ collapsed }: { collapsed: boolean }) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const visibleGroups = filterNavGroupsByRole(navGroups, session?.user.role);

  return (
    <aside
      className={cn(
        "fixed inset-y-4 left-4 z-20 hidden border border-[var(--sidebar-border)] bg-[var(--sidebar)] px-4 py-5 text-[var(--sidebar-foreground)] shadow-[var(--shadow-panel)] lg:flex lg:flex-col",
        collapsed ? "w-24 rounded-[1rem]" : "w-[16.25rem] rounded-[1rem]",
      )}
    >
      <div className={cn("mb-8 shrink-0", !collapsed && "px-2")}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      <div className="relative min-h-0 flex-1">
        <nav
          className="sidebar-scroll absolute inset-0 space-y-6 overflow-y-auto pb-2"
          aria-label={t("common.navigation")}
        >
          <NavGroupList groups={visibleGroups} collapsed={collapsed} />
        </nav>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-[var(--sidebar)] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--sidebar)] to-transparent"
        />
      </div>

      <div className="mt-auto rounded-[0.9rem] border border-[var(--sidebar-border)] bg-[var(--sidebar-elevated)] p-4">
        {!collapsed ? (
          <>
            <p className="text-xs font-medium text-[var(--sidebar-muted)]">Workspace status</p>
            <p className="mt-2 text-sm text-[var(--sidebar-foreground)]">
              Everything looks stable today.
            </p>
          </>
        ) : (
          <div className="h-10 rounded-xl bg-[var(--sidebar)]" />
        )}
      </div>
    </aside>
  );
};
