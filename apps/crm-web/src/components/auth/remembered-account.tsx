import { ArrowRight, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type RememberedAccountProps = {
  name: string;
  email: string;
  pending: boolean;
  onContinue: () => void;
  onSwitch: () => void;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export const RememberedAccount = ({
  name,
  email,
  pending,
  onContinue,
  onSwitch,
}: RememberedAccountProps) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="space-y-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface-panel)] p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-[var(--accent)] text-[var(--accent-foreground)]">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{name}</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">{email}</p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full justify-between"
          disabled={pending}
          aria-busy={pending}
          onClick={onContinue}
        >
          <span className="flex items-center gap-2">
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {pending ? t("login.signingIn") : t("login.continueAs", { name })}
          </span>
          {!pending ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
        </Button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onSwitch}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {t("login.switchAccount")}
        </button>
      </div>
    </>
  );
};
