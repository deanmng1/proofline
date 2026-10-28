import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { RememberedAccount } from "@/components/auth/remembered-account";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { demoPersona, type LoginMethod, rememberedUserStorage } from "@/features/auth/auth-api";
import { useAuth } from "@/features/auth/auth-context";

const REPO_URL = "https://github.com/tomtapia/admin-dashboard-template";

export const LoginPage = () => {
  const { login } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"account" | "password">("account");
  const [removed, setRemoved] = useState(false);

  const savedUser = rememberedUserStorage.get();
  const persona = savedUser ?? demoPersona;
  const showRemembered = mode === "account" && !removed;
  const hasSavedAccount = Boolean(savedUser) && !removed;

  const stateFrom = (location.state as { from?: string } | null)?.from;
  const redirectTo = stateFrom?.startsWith("/app") ? stateFrom : undefined;

  const handleLogin = async (options?: { method?: LoginMethod; email?: string }) => {
    setPending(true);
    setFailed(false);
    try {
      await login({ ...options, redirectTo });
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--background)] px-4 py-10">
      <div aria-hidden="true" className="auth-dot-grid absolute inset-0" />
      <Card className="relative w-full max-w-md">
        <CardHeader className="items-center gap-3 p-6 pb-0 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <p className="text-xl font-medium tracking-[-0.02em]">Admin Dash</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.welcomeTitle")}</h1>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {showRemembered ? (
            <RememberedAccount
              name={persona.name}
              email={persona.email}
              pending={pending}
              onContinue={() => void handleLogin()}
              onSwitch={() => setMode("password")}
            />
          ) : (
            <PasswordSignInForm
              pending={pending}
              errorMessage={failed ? t("login.errorGeneric") : null}
              hasSavedAccount={hasSavedAccount}
              onSubmit={(values) => handleLogin({ method: "password", email: values.email })}
              onUseSavedAccount={() => setMode("account")}
              onRemoveSavedAccount={() => {
                rememberedUserStorage.clear();
                setRemoved(true);
              }}
            />
          )}
          <div className="flex items-center" aria-hidden="true">
            <span className="h-px grow border-t border-dashed border-[var(--border-strong)]" />
            <p className="px-3 text-xs text-nowrap text-[var(--muted-foreground)]">
              {t("login.orSignInWith")}
            </p>
            <span className="h-px grow border-t border-dashed border-[var(--border-strong)]" />
          </div>
          <OAuthButtons disabled={pending} onSelect={(method) => void handleLogin({ method })} />
        </CardContent>
        <CardFooter className="justify-center border-t border-dashed border-[var(--border)] p-6 pt-4">
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            {t("login.needAssistance")}{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--accent)] hover:underline"
            >
              {t("login.helpCenter")}
            </a>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
};
