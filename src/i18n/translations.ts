/**
 * Локализация интерфейса Mibl Launcher 2.6.
 *
 * Русский — базовый словарь (источник TranslationKey), остальные словари
 * типизированы как Record<TranslationKey, string>, поэтому TypeScript не даст
 * собрать проект с непереведённым ключом.
 *
 * Язык интерфейса хранится отдельно от языка игры Minecraft
 * (`layout.language` / `config.game_language`).
 */

import { ru, type TranslationKey } from "./locales/ru";
import { en } from "./locales/en";
import { uk } from "./locales/uk";
import { de } from "./locales/de";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { pl } from "./locales/pl";
import { pt } from "./locales/pt";
import { tr } from "./locales/tr";
import { zh } from "./locales/zh";

export type { TranslationKey };

export type Language = "ru" | "en" | "uk" | "de" | "es" | "fr" | "pl" | "pt" | "tr" | "zh";

export const APP_LANGUAGES: Array<{ code: Language; label: string; short: string }> = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
  { code: "uk", label: "Українська", short: "UA" },
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "es", label: "Español", short: "ES" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "pl", label: "Polski", short: "PL" },
  { code: "pt", label: "Português", short: "PT" },
  { code: "tr", label: "Türkçe", short: "TR" },
  { code: "zh", label: "简体中文", short: "ZH" },
];

/** Ключ намеренно не меняется с 2.5, чтобы не сбросить выбор у пользователей. */
const LANG_STORAGE_KEY = "mibl.lang.v250";

export const translations: Record<Language, Record<TranslationKey, string>> = {
  ru,
  en,
  uk,
  de,
  es,
  fr,
  pl,
  pt,
  tr,
  zh,
};

/** Язык по умолчанию, если ничего не подошло. */
export const DEFAULT_LANGUAGE: Language = "ru";

const LANGUAGE_CODES = new Set<string>(APP_LANGUAGES.map((item) => item.code));

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_CODES.has(value);
}

/** Определяем язык по сохранённому выбору или языку системы/браузера. */
export function detectLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // localStorage может быть недоступен — используем язык системы.
  }
  const candidates =
    typeof navigator !== "undefined"
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : [];
  for (const raw of candidates) {
    const code = String(raw).toLowerCase().split("-")[0];
    if (code === "be" || code === "kk" || code === "ky") return "ru";
    if (isLanguage(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

export function saveLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, language);
  } catch {
    // Настройка просто не сохранится между запусками.
  }
}

/** Плейсхолдеры вида {name} — вынесены, чтобы проверять согласованность словарей. */
function placeholders(text: string): string[] {
  return (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
}

// В dev-режиме предупреждаем о разъехавшихся подстановках: TypeScript ловит
// только отсутствие ключа, но не потерю {name}/{n} в переводе.
const DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
if (DEV) {
  for (const [code, dictionary] of Object.entries(translations) as Array<
    [Language, Record<TranslationKey, string>]
  >) {
    if (code === "ru") continue;
    for (const key of Object.keys(ru) as TranslationKey[]) {
      const expected = placeholders(ru[key]).join("|");
      const actual = placeholders(dictionary[key] ?? "").join("|");
      if (expected !== actual) {
        console.warn(
          `[i18n] ${code}: подстановки в "${key}" не совпадают с ru (${expected} ≠ ${actual})`,
        );
      }
    }
  }
}

/** Перевод по ключу с поддержкой подстановок `{name}`. */
export function translate(
  language: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dictionary = translations[language] ?? translations[DEFAULT_LANGUAGE];
  let text: string = dictionary[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
