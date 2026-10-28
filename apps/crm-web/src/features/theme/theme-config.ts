export type ThemeMode = "light" | "dark";
export const themeStorageKey = "admin-dashboard-theme";

export const themeDefinitions = [
  {
    id: "oneui-ash",
    label: "Core Light",
    mode: "light",
    preview: ["#f3f5f8", "#dbe2ea", "#2563eb"],
  },
  {
    id: "midnight-ops",
    label: "Midnight Ops",
    mode: "dark",
    preview: ["#111827", "#1f2937", "#7dd3fc"],
  },
  {
    id: "sunset-ember",
    label: "Sunset Ember",
    mode: "light",
    preview: ["#fdf6f3", "#f3ddd3", "#f97316"],
  },
  {
    id: "forest-deep",
    label: "Forest Deep",
    mode: "dark",
    preview: ["#0a1410", "#1c3326", "#34d399"],
  },
] as const;

export type ThemeId = (typeof themeDefinitions)[number]["id"];

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  mode: ThemeMode;
  preview: readonly [string, string, string];
};

export const defaultThemeId: ThemeId = "oneui-ash";

export const isThemeId = (value: string | null): value is ThemeId =>
  themeDefinitions.some((theme) => theme.id === value);
