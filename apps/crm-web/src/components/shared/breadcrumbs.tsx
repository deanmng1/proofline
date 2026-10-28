import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { resolveNavTrail } from "@/components/layout/nav-items";

type Crumb = {
  label: string;
  href?: string;
};

export const Breadcrumbs = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const trail = resolveNavTrail(pathname);
  if (!trail) return null;

  const crumbs: Crumb[] = [{ label: t(trail.group.label) }];
  if (trail.child) {
    const sectionTarget = trail.item.children?.find((child) => child.href)?.href;
    crumbs.push({ label: t(trail.item.title), href: sectionTarget });
    crumbs.push({ label: t(trail.child.title) });
  } else if (trail.item.href) {
    crumbs.push({ label: t(trail.item.title) });
  }

  return (
    <nav aria-label={t("common.breadcrumb")}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--muted-foreground)]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-[var(--border-strong)]"
                  aria-hidden="true"
                />
              ) : null}
              {isLast ? (
                <span aria-current="page" className="font-medium text-[var(--foreground)]">
                  {crumb.label}
                </span>
              ) : crumb.href ? (
                <Link
                  to={crumb.href}
                  className="rounded-sm transition-colors hover:text-[var(--foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
