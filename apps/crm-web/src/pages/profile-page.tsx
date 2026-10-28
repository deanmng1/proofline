import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getProfileRequest } from "@/features/profile/profile-api";

export const ProfilePage = () => {
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfileRequest,
  });

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Profile"
          title="Your profile"
          description="Identity and recent account activity for the signed-in user."
        />
        <ListSkeleton count={4} />
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <StatePanel
        kind="error"
        title="Could not load profile"
        description="The mock profile endpoint failed."
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }

  const { user, memberSince, timezone, activity } = profileQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profile"
        title="Your profile"
        description="Identity and recent account activity for the signed-in user."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Identity" description="Details attached to your session.">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-[var(--border)] ring-offset-2 ring-offset-[var(--surface)]">
              <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                {user.name}
              </p>
              <p className="truncate text-sm text-[var(--foreground-muted)]">{user.email}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="default">{user.role}</Badge>
                <Badge variant="outline">{user.organization}</Badge>
              </div>
            </div>
          </div>
          <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-[var(--border)] pt-5 text-sm sm:grid-cols-2">
            <div className="border-b border-[var(--border)] pb-4 sm:border-b-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Member since
              </dt>
              <dd className="mt-1 text-[var(--foreground)]">{memberSince}</dd>
            </div>
            <div className="border-b border-[var(--border)] pb-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Timezone
              </dt>
              <dd className="mt-1 text-[var(--foreground)]">{timezone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                User ID
              </dt>
              <dd className="mt-1 font-mono text-xs text-[var(--foreground-muted)]">{user.id}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Recent activity" description="Security-relevant account events.">
          <div className="space-y-3">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] px-4 py-3"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                <div className="min-w-0">
                  <p className="text-sm text-[var(--foreground)]">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                    {item.subtitle} · {item.at}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
