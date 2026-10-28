import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/features/i18n";
import { cn } from "@/lib/utils";

export const LanguagePicker = () => {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="sr-only">{t("common.language")}</legend>
      {supportedLanguages.map((language) => {
        const selected = current === language.code;
        return (
          <label
            key={language.code}
            className={cn(
              "relative flex min-h-11 min-w-36 cursor-pointer items-center justify-between gap-3 rounded-[0.8rem] border px-4 py-3 text-left transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
              selected
                ? "border-[var(--accent)] bg-[var(--surface-panel)]"
                : "border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-panel)]",
            )}
          >
            <input
              type="radio"
              name="user-language"
              value={language.code}
              checked={selected}
              onChange={() => void i18n.changeLanguage(language.code)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="text-sm font-medium">{language.label}</span>
            {selected ? (
              <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
};
