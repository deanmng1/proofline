import { useTranslation } from "react-i18next";
import { useTheme } from "@/features/theme/theme-context";
import { cn } from "@/lib/utils";

export const AppearancePicker = () => {
  const { themeId, themes, setThemeId } = useTheme();
  const { t } = useTranslation();

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">{t("userSettings.appearance.title")}</legend>
      {themes.map((entry) => {
        const selected = entry.id === themeId;
        return (
          <label
            key={entry.id}
            className={cn(
              "relative flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-[0.8rem] border p-4 text-left transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
              selected
                ? "border-[var(--accent)] bg-[var(--surface-panel)]"
                : "border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-panel)]",
            )}
          >
            <input
              type="radio"
              name="theme-palette"
              value={entry.id}
              checked={selected}
              onChange={() => setThemeId(entry.id)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{entry.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                {entry.mode === "dark" ? "Dark" : "Light"} palette
              </span>
            </span>
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
              {entry.preview.map((swatch) => (
                <span
                  key={swatch}
                  className="h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};
