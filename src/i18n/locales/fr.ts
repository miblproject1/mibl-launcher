import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const fr: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Boîte de décorations de Noël",
  "christmas.boxShort": "Ouvrir le cadeau",
  "christmas.enabled": "Thème de Noël activé ! Joyeux Noël !",
  "christmas.disabled": "Thème de Noël désactivé.",
  "christmas.treeHint": "Cliquez sur le sapin pour allumer la guirlande",
  "christmas.removeHint": "Double-clic ou clic droit pour retirer la guirlande",
  "settings.christmasTitle": "Thème de Noël",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Mode Noël",
  "settings.christmasHint": "Nuit d'hiver enneigée, neige sur les boutons et flocons à chaque clic.",
  "settings.christmasGarlands": "Boîte de guirlandes",
  "settings.christmasGarlandsHint": "Maintenez et faites glisser une guirlande n'importe où sur l'écran. Un double-clic ou un clic droit la range dans la boîte.",
  "settings.garlandClassic": "Classique",
  "settings.garlandGold": "Or chaud",
  "settings.garlandIce": "Bleu glacial",
  "settings.garlandsPlaced": "Guirlandes à l'écran : {n}",
  "settings.clearGarlands": "Retirer toutes les guirlandes",
  "settings.garlandsCleared": "Toutes les guirlandes sont revenues dans la boîte.",
  "settings.treeLights": "Guirlande du sapin",
  "settings.treeLightsHint": "Vous pouvez aussi cliquer sur le sapin en arrière-plan.",
};
