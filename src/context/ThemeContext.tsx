import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import type { Theme, ThemePreset } from "../lib/api";
import { applyThemeVars } from "../lib/utils";

export const DEFAULT_THEME: Theme = {
  preset: "dark",
  accent: "#5E6AD2",
  bg: "#0C0D10",
  panel: "#13151B",
  panel2: "#1A1D24",
  fg: "#EDEEF2",
  muted: "#8B90A0",
  glass: 0.72,
  radius: 12,
  font: "Segoe UI",
  bg_image: "",
  bg_dim: 0.45,
  bg_blur: 8,
  audio: "",
  volume: 0.45,
  bg_video: "",
  bg_video_muted: true,
};

interface ThemeContextValue {
  theme: Theme;
  savedTheme: Theme;
  presets: ThemePreset[];
  dirty: boolean;
  previewTheme: (theme: Theme) => void;
  patchTheme: (patch: Partial<Theme>) => void;
  saveTheme: (theme?: Theme) => Promise<Theme>;
  resetTheme: () => Promise<Theme>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

function sameTheme(a: Theme, b: Theme): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ThemeProvider({
  children,
  initialTheme,
  presets = [],
}: {
  children: ReactNode;
  initialTheme?: Theme;
  presets?: ThemePreset[];
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme ?? DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<Theme>(initialTheme ?? DEFAULT_THEME);

  useEffect(() => {
    applyThemeVars(theme);
  }, [theme]);

  const previewTheme = useCallback((next: Theme) => {
    setTheme(next);
  }, []);

  const patchTheme = useCallback((patch: Partial<Theme>) => {
    setTheme((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveTheme = useCallback(async (next?: Theme) => {
    const target = next ?? theme;
    const saved = await api.saveTheme(target);
    setTheme(saved);
    setSavedTheme(saved);
    return saved;
  }, [theme]);

  const resetTheme = useCallback(async () => {
    const saved = await api.resetTheme();
    setTheme(saved);
    setSavedTheme(saved);
    return saved;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      savedTheme,
      presets,
      dirty: !sameTheme(theme, savedTheme),
      previewTheme,
      patchTheme,
      saveTheme,
      resetTheme,
    }),
    [theme, savedTheme, presets, previewTheme, patchTheme, saveTheme, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
