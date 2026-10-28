import { canAccess } from "@/lib/rbac";
import type { AppRole, NavItem } from "@/types";

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type NavLeaf = NavItem & { href: string };

export type NavTrail = {
  group: NavGroup;
  item: NavItem;
  child?: NavItem;
};

export const navGroups: NavGroup[] = [
  {
    label: "nav.group.dashboard",
    items: [
      { title: "nav.overview", href: "/app/overview", icon: "LayoutDashboard" },
      { title: "nav.analytics", href: "/app/analytics", icon: "LineChart" },
    ],
  },
  {
    label: "nav.group.apps",
    items: [
      {
        title: "nav.mail",
        icon: "Mail",
        children: [
          { title: "nav.mailInbox", href: "/app/mail", icon: "Inbox" },
          { title: "nav.mailSent", href: "/app/mail/sent", icon: "Send" },
        ],
      },
      { title: "nav.calendar", href: "/app/calendar", icon: "Calendar" },
      {
        title: "nav.notifications",
        href: "/app/notifications",
        icon: "Bell",
        roles: ["Owner", "Admin", "Manager"],
      },
      {
        title: "nav.support",
        href: "/app/support",
        icon: "LifeBuoy",
        roles: ["Owner", "Admin", "Manager"],
      },
      {
        title: "nav.integrations",
        href: "/app/integrations",
        icon: "Plug",
        roles: ["Owner", "Admin"],
      },
    ],
  },
  {
    label: "nav.group.pages",
    items: [
      {
        title: "nav.people",
        icon: "UsersRound",
        children: [
          {
            title: "nav.users",
            href: "/app/users",
            icon: "Users",
            roles: ["Owner", "Admin", "Manager"],
          },
          { title: "nav.team", href: "/app/team", icon: "UserCog", roles: ["Owner", "Admin"] },
        ],
      },
      {
        title: "nav.finance",
        icon: "Wallet",
        children: [
          {
            title: "nav.billing",
            href: "/app/billing",
            icon: "CreditCard",
            roles: ["Owner", "Admin"],
          },
          {
            title: "nav.transactions",
            href: "/app/transactions",
            icon: "Receipt",
            roles: ["Owner", "Admin", "Manager"],
          },
        ],
      },
      { title: "nav.profile", href: "/app/profile", icon: "UserRound" },
      { title: "nav.authentication", href: "/login", icon: "KeyRound" },
      { title: "nav.notFound", href: "/app/404", icon: "FileQuestion" },
    ],
  },
  {
    label: "nav.group.uiElements",
    items: [{ title: "nav.uiKit", href: "/app/ui", icon: "Shapes" }],
  },
  {
    label: "nav.group.data",
    items: [
      { title: "nav.dataTables", href: "/app/data/tables", icon: "Table2" },
      { title: "nav.dataCharts", href: "/app/data/charts", icon: "BarChart3" },
    ],
  },
  {
    label: "nav.group.settings",
    items: [
      { title: "nav.userSettings", href: "/app/settings/user", icon: "UserRoundCog" },
      { title: "nav.settings", href: "/app/settings", icon: "Settings" },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

const isLeaf = (item: NavItem): item is NavLeaf => Boolean(item.href);

export const navLeafItems: NavLeaf[] = navItems.flatMap((item) =>
  item.children ? item.children.filter(isLeaf) : isLeaf(item) ? [item] : [],
);

export const filterNavGroupsByRole = (groups: NavGroup[], role?: AppRole): NavGroup[] =>
  groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => canAccess(role, child.roles)) }
            : item,
        )
        .filter(
          (item) => canAccess(role, item.roles) && (!item.children || item.children.length > 0),
        ),
    }))
    .filter((group) => group.items.length > 0);

export const resolveNavTrail = (pathname: string): NavTrail | undefined => {
  const candidates: { group: NavGroup; item: NavItem; child?: NavItem; href: string }[] = [];
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href) candidates.push({ group, item, href: item.href });
      for (const child of item.children ?? []) {
        if (child.href) candidates.push({ group, item, child, href: child.href });
      }
    }
  }
  const match = candidates
    .sort((a, b) => b.href.length - a.href.length)
    .find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  if (!match) return undefined;
  return { group: match.group, item: match.item, child: match.child };
};
