import { BarChart3, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/features/tenants/tenant-context";
import { cn } from "@/lib/utils";

type WorkspaceSwitcherProps = {
  collapsed?: boolean;
  className?: string;
};

export const WorkspaceSwitcher = ({ collapsed = false, className }: WorkspaceSwitcherProps) => {
  const { tenants, currentTenant, setCurrentTenant, isLoaded } = useTenant();
  const { t } = useTranslation();

  const label = currentTenant
    ? `${t("common.switchWorkspace")} — ${currentTenant.name}`
    : t("common.switchWorkspace");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={!isLoaded}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-elevated)] p-1.5 text-left transition-colors hover:bg-[var(--sidebar-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-70",
            collapsed ? "w-full justify-center" : "w-full pr-2.5",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_10px_24px_rgba(0,0,0,0.2)]"
          >
            <BarChart3 className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <span className="min-w-0 flex-col leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">
                ADMIN DASH
              </span>
              <span className="block max-w-[11rem] truncate text-xs text-[var(--sidebar-muted)]">
                {currentTenant?.name ?? t("common.workspace")}
              </span>
            </span>
          ) : null}
          {!collapsed ? (
            <ChevronDown
              aria-hidden="true"
              className="ml-auto h-4 w-4 shrink-0 text-[var(--sidebar-muted)]"
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("common.workspace")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentTenant?.id ?? ""}
          onValueChange={(value) => setCurrentTenant(value)}
        >
          {tenants.map((tenant) => (
            <DropdownMenuRadioItem key={tenant.id} value={tenant.id}>
              <div className="min-w-0">
                <p className="font-medium">{tenant.name}</p>
                <p className="text-xs capitalize text-[var(--muted-foreground)]">
                  {tenant.plan} · {tenant.status}
                </p>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
