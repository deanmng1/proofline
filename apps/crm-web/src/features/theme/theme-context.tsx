import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultThemeId,
  isThemeId,
  type ThemeDefinition,
  type ThemeId,
  themeDefinitions,
  themeStorageKey,
} from "@/features/theme/theme-config";

type ThemeContextValue = {
  theme: ThemeDefinition;
  themeId: ThemeId;
  themes: readonly ThemeDefinition[];
  setThemeId: (themeId: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialTheme = (): ThemeId => {
  if (typeof window === "undefined") {
    return defaultThemeId;
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (isThemeId(storedTheme)) {
    return storedTheme;
  }

  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (prefersDark) {
    return themeDefinitions.find((theme) => theme.mode === "dark")?.id ?? defaultThemeId;
  }

  return defaultThemeId;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeId] = useState<ThemeId>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    window.localStorage.setItem(themeStorageKey, themeId);

    const nextTheme = themeDefinitions.find((theme) => theme.id === themeId) ?? themeDefinitions[0];
    document.documentElement.style.colorScheme = nextTheme.mode;
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = themeDefinitions.find((entry) => entry.id === themeId) ?? themeDefinitions[0];
    return {
      theme,
      themeId,
      themes: themeDefinitions,
      setThemeId,
    };
  }, [themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
};
