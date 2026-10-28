import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordSignInFormProps = {
  pending: boolean;
  errorMessage: string | null;
  hasSavedAccount: boolean;
  onSubmit: (values: PasswordSignInValues) => Promise<void>;
  onUseSavedAccount: () => void;
  onRemoveSavedAccount: () => void;
};

type PasswordSignInValues = {
  email: string;
  password: string;
};

export const PasswordSignInForm = ({
  pending,
  errorMessage,
  hasSavedAccount,
  onSubmit,
  onUseSavedAccount,
  onRemoveSavedAccount,
}: PasswordSignInFormProps) => {
  const { t } = useTranslation();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t("login.errorEmailRequired")).email(t("login.errorInvalidEmail")),
        password: z.string().min(8, t("login.errorPasswordLength")),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordSignInValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((values) => onSubmit(values))}>
      {errorMessage ? (
        <Alert variant="danger">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="login-email">{t("login.emailLabel")}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          disabled={pending}
          aria-invalid={errors.email ? true : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-xs text-[var(--danger)]">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">{t("login.passwordLabel")}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          disabled={pending}
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-xs text-[var(--danger)]">{errors.password.message}</p>
        ) : null}
      </div>
      <Button
        type="submit"
        className="w-full justify-center"
        disabled={pending}
        aria-busy={pending}
      >
        <span className="flex items-center gap-2">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? t("login.signingIn") : t("login.signIn")}
        </span>
      </Button>
      {hasSavedAccount ? (
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onUseSavedAccount}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            {t("login.useSavedAccount")}
          </button>
          <button
            type="button"
            onClick={onRemoveSavedAccount}
            className="text-[var(--muted-foreground)] hover:underline"
          >
            {t("login.removeSavedAccount")}
          </button>
        </div>
      ) : null}
    </form>
  );
};
