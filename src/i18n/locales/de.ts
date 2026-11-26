import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const de: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Kiste mit Weihnachtsschmuck",
  "christmas.boxShort": "Geschenk öffnen",
  "christmas.enabled": "Weihnachtsmodus aktiviert! Frohe Weihnachten!",
  "christmas.disabled": "Weihnachtsmodus deaktiviert.",
  "christmas.treeHint": "Klicke auf den Baum, um die Lichterkette einzuschalten",
  "christmas.removeHint": "Doppelklick oder Rechtsklick entfernt die Girlande",
  "settings.christmasTitle": "Weihnachtsthema",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Weihnachtsmodus",
  "settings.christmasHint": "Verschneite Winternacht, Schneehauben auf den Buttons und fallender Schnee bei jedem Klick.",
  "settings.christmasGarlands": "Kiste mit Girlanden",
  "settings.christmasGarlandsHint": "Halte eine Girlande gedrückt und ziehe sie an eine beliebige Stelle. Doppelklick oder Rechtsklick legt sie zurück.",
  "settings.garlandClassic": "Klassisch",
  "settings.garlandGold": "Warmes Gold",
  "settings.garlandIce": "Eisblau",
  "settings.garlandsPlaced": "Girlanden auf dem Bildschirm: {n}",
  "settings.clearGarlands": "Alle Girlanden entfernen",
  "settings.garlandsCleared": "Alle Girlanden sind zurück in der Kiste.",
  "settings.treeLights": "Lichterkette am Baum",
  "settings.treeLightsHint": "Du kannst auch den Baum im Hintergrund anklicken.",
};
