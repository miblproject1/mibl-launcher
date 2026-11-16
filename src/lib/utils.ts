import { convertFileSrc } from "@tauri-apps/api/core";
import { detectLanguage, translate, type TranslationKey } from "../i18n/translations";

const LOCALES: Record<string, string> = { ru: "ru-RU", uk: "uk-UA", en: "en-US" };

function currentLocale(): string {
  return LOCALES[detectLanguage()] ?? "ru-RU";
}

function tt(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(detectLanguage(), key, vars);
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return null;
  }
}

const PALETTES: Array<[string, string, string]> = [
  ["#232838", "#2E3650", "#3B4668"],
  ["#1E2A28", "#243B36", "#2E5048"],
  ["#2A2530", "#3A2F45", "#4A3A59"],
  ["#262A33", "#33405A", "#44557A"],
  ["#2B2429", "#3D2F35", "#523E46"],
  ["#242A26", "#2E3A2F", "#3D4C3E"],
  ["#2C2823", "#3C342A", "#504435"],
  ["#232636", "#2E3350", "#3E466C"],
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function coverGradient(name: string): string {
  const [a, b, c] = PALETTES[hash(name || "Mibl") % PALETTES.length];
  const angle = 115 + (hash(name || "Mibl") % 80);
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 52%, ${c} 100%)`;
}

export function accentAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(94, 106, 210, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

/** Цвет текста, который хорошо читается на фоне указанного цвета. */
export function contrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.62 ? "#111318" : "#ffffff";
}

export function applyThemeVars(theme: {
  accent: string;
  bg: string;
  panel: string;
  panel2: string;
  fg: string;
  muted: string;
  glass: number;
  radius: number;
  font: string;
}) {
  const safe = (value: string, fallback: string) => (hexToRgb(value) ? value : fallback);
  const accent = safe(theme.accent, "#5E6AD2");
  const bg = safe(theme.bg, "#0C0D10");
  const panel = safe(theme.panel, "#13151B");
  const panel2 = safe(theme.panel2, "#1A1D24");
  const fg = safe(theme.fg, "#EDEEF2");
  const muted = safe(theme.muted, "#8B90A0");
  const glass = Math.min(1, Math.max(0, theme.glass));

  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--bg", bg);
  root.style.setProperty("--panel", panel);
  root.style.setProperty("--panel2", panel2);
  root.style.setProperty("--fg", fg);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--glass", String(glass));
  root.style.setProperty("--radius", `${theme.radius}px`);
  root.style.setProperty("--font", theme.font || "Segoe UI");
  root.style.setProperty("--accent-soft", accentAlpha(accent, 0.18));
  root.style.setProperty("--accent-line", accentAlpha(accent, 0.55));
  root.style.setProperty("--accent-glow", accentAlpha(accent, 0.28));
  root.style.setProperty("--accent-fg", contrastColor(accent));
  root.style.setProperty("--fg-line", accentAlpha(fg, 0.14));
  root.style.setProperty("--fg-soft", accentAlpha(fg, 0.08));
  root.style.setProperty("--panel-glass", accentAlpha(panel, glass));
  root.style.setProperty("--panel2-glass", accentAlpha(panel2, Math.min(1, glass + 0.08)));
  root.style.colorScheme = contrastColor(bg) === "#111318" ? "light" : "dark";
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isValidNick(nick: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(nick.trim());
}

export function formatDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds || unixSeconds <= 0) return tt("time.neverPlayed");
  try {
    return new Date(unixSeconds * 1000).toLocaleString(currentLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return tt("time.unknown");
  }
}

export function formatRelative(unixSeconds: number | null | undefined): string {
  if (!unixSeconds || unixSeconds <= 0) return tt("time.neverPlayed");
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return tt("time.justNow");
  if (diff < 3600) return tt("time.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86_400) return tt("time.hoursAgo", { n: Math.floor(diff / 3600) });
  if (diff < 2_592_000) return tt("time.daysAgo", { n: Math.floor(diff / 86_400) });
  return formatDateTime(unixSeconds);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(currentLocale()).format(n);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(path);
}

export function isVideoPath(path: string): boolean {
  return /\.(mp4|webm|ogg|mov|mkv)$/i.test(path);
}
