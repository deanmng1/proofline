import { useTranslation } from "react-i18next";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { LanguagePicker } from "@/components/settings/language-picker";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { useAuth } from "@/features/auth/auth-context";

export const UserSettingsPage = () => {
  const { t } = useTranslation();
  const { session } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("userSettings.eyebrow")}
        title={t("userSettings.title")}
        description={t("userSettings.description")}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard
            tone="primary"
            title={t("userSettings.appearance.title")}
            description={t("userSettings.appearance.description")}
          >
            <AppearancePicker />
          </SectionCard>

          <SectionCard
            title={t("userSettings.language.title")}
            description={t("userSettings.language.description")}
          >
            <LanguagePicker />
          </SectionCard>
        </div>

        <SectionCard
          tone="auxiliary"
          title={t("userSettings.account.title")}
          description={t("userSettings.account.description")}
          className="xl:sticky xl:top-24"
        >
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                {session?.user.name}
              </dt>
              <dd className="mt-1 text-sm text-[var(--foreground)]">{session?.user.email}</dd>
            </div>
            <div className="rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Role
              </dt>
              <dd className="mt-1 text-sm font-medium">{session?.user.role}</dd>
            </div>
            <div className="rounded-[0.9rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Organization
              </dt>
              <dd className="mt-1 text-sm font-medium">{session?.user.organization}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
};
