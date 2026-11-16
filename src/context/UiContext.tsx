import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  applyTypography,
  clampScale,
  readTypography,
  saveTypography,
  type TypographySettings,
} from "../lib/typography";
import {
  detectLanguage,
  saveLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "../i18n/translations";

/** Готовые пресеты оформления. */
export type UiStyle = "pixel" | "modern";
/** Расположение навигации: слева вертикально или сверху горизонтально. */
export type NavPlacement = "left" | "top";
/** Нижний док запуска: всегда или только на «Главной». */
export type DockMode = "always" | "home";

export interface LayoutSettings {
  style: UiStyle;
  nav: NavPlacement;
  dock: DockMode;
  hero: boolean;
  /** Последняя выбранная сборка для нижнего дока. */
  instance: string;
  /** Язык игры по умолчанию. */
  language: string;
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  style: "pixel",
  nav: "top",
  dock: "always",
  hero: true,
  instance: "",
  language: "ru_ru",
};

const STORAGE_KEY = "mibl.layout.v24";

/* ------------------------------------------------------------------ HUD 2.5.0 */
/** Элементы главного экрана, которые можно двигать и перекрашивать. */
export type HudKey = "instance" | "play" | "hero" | "left" | "right" | "nav";
export type HudVariant = "glass" | "solid" | "outline" | "ghost";

export interface HudElement {
  x: number;
  y: number;
  scale: number;
  bg: string;
  fg: string;
  variant: HudVariant;
  visible: boolean;
}

export type HudSettings = Record<HudKey, HudElement>;

export const HUD_KEYS: HudKey[] = ["instance", "play", "hero", "left", "right", "nav"];

const HUD_STORAGE_KEY = "mibl.hud.v241";

function defaultHudElement(): HudElement {
  return {
    x: 0,
    y: 0,
    scale: 1,
    bg: "",
    fg: "",
    variant: "glass",
    visible: true,
  };
}

export function defaultHud(): HudSettings {
  return {
    instance: defaultHudElement(),
    play: defaultHudElement(),
    hero: defaultHudElement(),
    left: defaultHudElement(),
    right: defaultHudElement(),
    nav: defaultHudElement(),
  };
}

export const DEFAULT_HUD: HudSettings = defaultHud();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readHud(): HudSettings {
  const fallback = defaultHud();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(HUD_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<HudKey, Partial<HudElement>>>;
    const result = defaultHud();
    for (const key of HUD_KEYS) {
      const saved = parsed?.[key];
      if (!saved) continue;
      result[key] = {
        x: clampNumber(saved.x, 0, -1200, 1200),
        y: clampNumber(saved.y, 0, -1200, 1200),
        scale: clampNumber(saved.scale, 1, 0.5, 2),
        bg: typeof saved.bg === "string" ? saved.bg : "",
        fg: typeof saved.fg === "string" ? saved.fg : "",
        variant:
          saved.variant === "solid" ||
          saved.variant === "outline" ||
          saved.variant === "ghost" ||
          saved.variant === "glass"
            ? saved.variant
            : "glass",
        visible: saved.visible !== false,
      };
    }
    return result;
  } catch {
    return fallback;
  }
}

/** Инлайн-стиль элемента HUD: позиция, масштаб, цвета и видимость. */
export function hudStyle(element: HudElement): CSSProperties {
  const style: CSSProperties = {};
  if (!element.visible) style.display = "none";
  const transforms: string[] = [];
  if (element.x !== 0 || element.y !== 0) {
    transforms.push(`translate(${element.x}px, ${element.y}px)`);
  }
  if (element.scale !== 1) transforms.push(`scale(${element.scale})`);
  if (transforms.length > 0) {
    style.transform = transforms.join(" ");
    style.transformOrigin = "center";
  }
  if (element.bg) style.background = element.bg;
  if (element.fg) style.color = element.fg;
  return style;
}

export function hudVariantClass(element: HudElement): string {
  return `hud-el hud-${element.variant}`;
}

export const UI_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "ru_ru", label: "Русский" },
  { code: "uk_ua", label: "Українська" },
  { code: "be_by", label: "Беларуская" },
  { code: "kk_kz", label: "Қазақша" },
  { code: "en_us", label: "English" },
  { code: "de_de", label: "Deutsch" },
];

export function languageLabel(code: string | null | undefined): string {
  const found = UI_LANGUAGES.find((item) => item.code === code);
  return found?.label ?? UI_LANGUAGES[0].label;
}

function readLayout(): LayoutSettings {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutSettings>;
    return {
      ...DEFAULT_LAYOUT,
      ...parsed,
      style: parsed.style === "modern" ? "modern" : "pixel",
      nav: parsed.nav === "top" ? "top" : "left",
      dock: parsed.dock === "home" ? "home" : "always",
      hero: parsed.hero !== false,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

interface UiContextValue {
  layout: LayoutSettings;
  hud: HudSettings;
  /** Шрифт и масштаб текста всего лаунчера. */
  typography: TypographySettings;
  /** Язык интерфейса лаунчера (не язык игры Minecraft). */
  language: Language;
  setLanguage: (language: Language) => void;
  /** Перевод по ключу с подстановками вида `{name}`. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  pixel: boolean;
  patch: (patch: Partial<LayoutSettings>) => void;
  patchHud: (key: HudKey, patch: Partial<HudElement>) => void;
  patchTypography: (patch: Partial<TypographySettings>) => void;
  /** Явно сохранить текущий шрифт и масштаб в localStorage. */
  saveTypographyNow: () => void;
  resetHud: () => void;
  reset: () => void;
}

const UiContext = createContext<UiContextValue | undefined>(undefined);

export function useUi(): UiContextValue {
  const context = useContext(UiContext);
  if (!context) {
    throw new Error("useUi must be used within a UiProvider");
  }
  return context;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<LayoutSettings>(readLayout);
  const [hud, setHud] = useState<HudSettings>(readHud);
  const [typography, setTypography] = useState<TypographySettings>(readTypography);
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  // Язык интерфейса: сохраняем выбор и сообщаем его браузеру/WebView.
  useEffect(() => {
    document.documentElement.lang = language;
    saveLanguage(language);
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // localStorage может быть недоступен — раскладка просто не сохранится.
    }
    const root = document.documentElement;
    root.dataset.ui = layout.style;
    root.dataset.nav = layout.nav;
    root.dataset.dock = layout.dock;
    root.dataset.hero = layout.hero ? "on" : "off";
  }, [layout]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HUD_STORAGE_KEY, JSON.stringify(hud));
    } catch {
      // HUD-настройки просто не сохранятся между запусками.
    }
  }, [hud]);

  // Шрифт и масштаб применяем до первой отрисовки: при запуске не должно быть
  // вспышки стандартного шрифта. Значения сразу уходят в CSS-переменную --app-font.
  useLayoutEffect(() => {
    saveTypography(typography);
    applyTypography(typography);
  }, [typography]);

  const patch = useCallback((next: Partial<LayoutSettings>) => {
    setLayout((prev) => ({ ...prev, ...next }));
  }, []);

  const patchHud = useCallback((key: HudKey, next: Partial<HudElement>) => {
    setHud((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  }, []);

  const patchTypography = useCallback((next: Partial<TypographySettings>) => {
    setTypography((prev) => {
      const merged = { ...prev, ...next };
      merged.scale = clampScale(merged.scale);
      return merged;
    });
  }, []);

  const resetHud = useCallback(() => {
    setHud(defaultHud());
  }, []);

  // Кнопка «Сохранить шрифт» и «Сохранить тему» вызывают это явно: настройки
  // пишутся в localStorage вместе с выбранным пресетом/файлом и масштабом.
  const saveTypographyNow = useCallback(() => {
    saveTypography(typography);
    applyTypography(typography);
  }, [typography]);

  const reset = useCallback(() => {
    setLayout({ ...DEFAULT_LAYOUT });
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      layout,
      hud,
      typography,
      language,
      setLanguage,
      t,
      pixel: layout.style === "pixel",
      patch,
      patchHud,
      patchTypography,
      saveTypographyNow,
      resetHud,
      reset,
    }),
    [
      layout,
      hud,
      typography,
      language,
      setLanguage,
      t,
      patch,
      patchHud,
      patchTypography,
      saveTypographyNow,
      resetHud,
      reset,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
