import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { getNavIcon } from "@/components/layout/nav-icons";
import type { NavGroup } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

type NavGroupListProps = {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
};

const rowClass =
  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const rowActiveClass = "bg-[var(--sidebar-active)] text-[var(--sidebar-active-foreground)]";
const rowIdleClass =
  "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]";

const isPathActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const NavGroupList = ({ groups, collapsed = false, onNavigate }: NavGroupListProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});

  const isSectionOpen = (key: string, item: NavItem) => {
    const override = sectionOverrides[key];
    if (override !== undefined) return override;
    return (
      item.children?.some((child) => child.href && isPathActive(pathname, child.href)) ?? false
    );
  };

  const toggleSection = (key: string, currentlyOpen: boolean) =>
    setSectionOverrides((state) => ({ ...state, [key]: !currentlyOpen }));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(rowClass, isActive ? rowActiveClass : rowIdleClass);

  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          {!collapsed ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
              {t(group.label)}
            </p>
          ) : null}
          {group.items.map((item) => {
            const Icon = getNavIcon(item.icon);
            const sectionKey = `${group.label}:${item.title}`;

            if (item.children) {
              const firstChild = item.children.find((child): child is NavItem & { href: string } =>
                Boolean(child.href),
              );
              const sectionActive = item.children.some(
                (child) => child.href && isPathActive(pathname, child.href),
              );

              if (collapsed) {
                return firstChild ? (
                  <NavLink
                    key={sectionKey}
                    to={firstChild.href}
                    title={t(item.title)}
                    aria-label={t(item.title)}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(rowClass, "justify-center", !isActive && rowIdleClass)
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </NavLink>
                ) : null;
              }

              const isOpen = isSectionOpen(sectionKey, item);
              return (
                <div key={sectionKey}>
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionKey, isOpen)}
                    aria-expanded={isOpen}
                    className={cn(
                      rowClass,
                      "w-full",
                      sectionActive ? "text-[var(--sidebar-foreground)]" : rowIdleClass,
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t(item.title)}</span>
                    <ChevronDown
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0 transition-transform",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen ? (
                    <div className="mt-1 space-y-1">
                      {item.children
                        .filter((child): child is NavItem & { href: string } => Boolean(child.href))
                        .map((child) => (
                          <NavLink
                            key={child.href}
                            to={child.href}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                              cn(
                                rowClass,
                                "pl-10 text-[13px]",
                                isActive ? rowActiveClass : rowIdleClass,
                              )
                            }
                          >
                            {t(child.title)}
                          </NavLink>
                        ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            if (!item.href) return null;

            return (
              <NavLink
                key={sectionKey}
                to={item.href}
                title={collapsed ? t(item.title) : undefined}
                aria-label={collapsed ? t(item.title) : undefined}
                onClick={onNavigate}
                className={linkClass}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed ? <span>{t(item.title)}</span> : null}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );
};
