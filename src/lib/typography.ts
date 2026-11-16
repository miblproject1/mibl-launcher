import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Типографика интерфейса (Mibl Launcher 2.5).
 *
 * Настройки хранятся в localStorage и применяются ко всему лаунчеру:
 *  - `--app-font` — семейство шрифта (предустановка или свой файл с диска);
 *  - `html { font-size }` — базовый масштаб текста (85–125%).
 *
 * Свой шрифт (.ttf/.otf/.woff2) подключается через `@font-face`, а путь
 * Windows преобразуется в `asset://`-URL через `convertFileSrc`.
 */

export const TYPOGRAPHY_STORAGE_KEY = "mibl.typography.v250";

export interface FontPreset {
  key: string;
  label: string;
  hint: string;
  stack: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    key: "standard",
    label: "Стандартный современный",
    hint: "Inter / Segoe UI — чистый интерфейс без украшений.",
    stack: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  {
    key: "pixel",
    label: "Пиксельный Minecraft",
    hint: "Pixelify Sans и Silkscreen — атмосфера ретро-игры.",
    stack:
      '"Pixelify Sans", "Silkscreen", "Handjet", Consolas, "Courier New", ui-monospace, monospace',
  },
  {
    key: "mono",
    label: "Моноширинный / Код",
    hint: "JetBrains Mono / Cascadia Code — ровные колонки цифр.",
    stack:
      '"JetBrains Mono", "Cascadia Code", "Cascadia Mono", Consolas, "Courier New", ui-monospace, monospace',
  },
  {
    key: "rounded",
    label: "Мягкий округлый",
    hint: "Nunito и Segoe UI Rounded — дружелюбный вид.",
    stack:
      'Nunito, "Segoe UI Rounded", "Varela Round", "Comic Sans MS", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  },
];

export const CUSTOM_FONT_KEY = "custom";
/** Имя семейства, под которым регистрируется шрифт с диска через FontFace. */
export const CUSTOM_FONT_FAMILY = "MiblCustomFont";

export interface TypographySettings {
  /** Ключ предустановки или `custom` для шрифта с диска. */
  preset: string;
  /** Полный путь к пользовательскому файлу шрифта. */
  custom_path: string;
  /** Отображаемое имя файла пользовательского шрифта. */
  custom_name: string;
  /** Масштаб текста в процентах: 85–125, шаг 5. */
  scale: number;
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  preset: "standard",
  custom_path: "",
  custom_name: "",
  scale: 100,
};

export function clampScale(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 100;
  const rounded = Math.round(parsed / 5) * 5;
  return Math.min(125, Math.max(85, rounded));
}

export function readTypography(): TypographySettings {
  if (typeof window === "undefined") return { ...DEFAULT_TYPOGRAPHY };
  try {
    const raw = window.localStorage.getItem(TYPOGRAPHY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TYPOGRAPHY };
    const parsed = JSON.parse(raw) as Partial<TypographySettings>;
    const preset =
      parsed.preset === CUSTOM_FONT_KEY ||
      FONT_PRESETS.some((item) => item.key === parsed.preset)
        ? (parsed.preset as string)
        : DEFAULT_TYPOGRAPHY.preset;
    return {
      preset,
      custom_path: typeof parsed.custom_path === "string" ? parsed.custom_path : "",
      custom_name: typeof parsed.custom_name === "string" ? parsed.custom_name : "",
      scale: clampScale(parsed.scale),
    };
  } catch {
    return { ...DEFAULT_TYPOGRAPHY };
  }
}

export function saveTypography(settings: TypographySettings): void {
  try {
    window.localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage может быть недоступен — настройки просто не сохранятся.
  }
}

export function fontPreset(key: string): FontPreset | undefined {
  return FONT_PRESETS.find((item) => item.key === key);
}

/** Итоговый CSS font-family с учётом пользовательского шрифта. */
export function fontStack(settings: TypographySettings): string {
  if (settings.preset === CUSTOM_FONT_KEY && settings.custom_path) {
    return `"${CUSTOM_FONT_FAMILY}", Inter, "Segoe UI", system-ui, sans-serif`;
  }
  return fontPreset(settings.preset)?.stack ?? FONT_PRESETS[0].stack;
}

export function typographyLabel(settings: TypographySettings): string {
  if (settings.preset === CUSTOM_FONT_KEY && settings.custom_path) {
    return settings.custom_name || "Свой шрифт";
  }
  return fontPreset(settings.preset)?.label ?? FONT_PRESETS[0].label;
}

/** Проверить расширение файла шрифта. */
export function isFontPath(path: string): boolean {
  return /\.(ttf|otf|woff2?|ttc)$/i.test(path);
}

/** Уже загруженные пользовательские шрифты: путь -> промис загрузки. */
const loadedCustomFonts = new Map<string, Promise<boolean>>();

/** Преобразовать путь Windows в URL, понятный WebView. */
function fontFileUrl(path: string): string {
  let url = path;
  try {
    if (!/^(data:|https?:|asset:|blob:)/i.test(path)) {
      url = convertFileSrc(path);
    }
  } catch {
    // Если convertFileSrc недоступен, оставляем исходный путь.
  }
  return url.replace(/"/g, "%22");
}

/**
 * Загрузить пользовательский файл шрифта через FontFace и зарегистрировать его
 * в документе под именем `MiblCustomFont`. Шрифт сразу становится доступен
 * для `--app-font`, без перезагрузки страницы.
 */
export function loadCustomFont(path: string): Promise<boolean> {
  if (typeof document === "undefined" || !path) return Promise.resolve(false);
  const cached = loadedCustomFonts.get(path);
  if (cached) return cached;

  const task = (async () => {
    try {
      if (typeof FontFace === "undefined" || !document.fonts) return false;
      const face = new FontFace(CUSTOM_FONT_FAMILY, `url("${fontFileUrl(path)}")`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (error) {
      console.warn("Не удалось загрузить пользовательский шрифт:", error);
      loadedCustomFonts.delete(path);
      return false;
    }
  })();

  loadedCustomFonts.set(path, task);
  return task;
}

/** Применить настройки типографики глобально и мгновенно. */
export function applyTypography(settings: TypographySettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const scale = clampScale(settings.scale);
  const stack = fontStack(settings);

  root.style.setProperty("--app-font", stack);
  root.style.setProperty("--app-font-scale", String(scale / 100));
  root.style.fontSize = `${Math.round(16 * (scale / 100))}px`;
  root.dataset.typography = settings.preset;

  // Свой шрифт с диска: грузим файл один раз и сразу переприменяем стек,
  // когда FontFace станет доступен (до этого работает системный фоллбэк).
  if (settings.preset === CUSTOM_FONT_KEY && settings.custom_path) {
    void loadCustomFont(settings.custom_path).then((ok) => {
      if (!ok) return;
      root.style.setProperty("--app-font", fontStack(settings));
    });
  }
}
