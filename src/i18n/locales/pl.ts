import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const pl: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Pudełko świątecznych ozdób",
  "christmas.boxShort": "Otwórz prezent",
  "christmas.enabled": "Motyw świąteczny włączony! Wesołych Świąt!",
  "christmas.disabled": "Motyw świąteczny wyłączony.",
  "christmas.treeHint": "Kliknij choinkę, aby zapalić girlandę",
  "christmas.removeHint": "Dwuklik lub prawy przycisk usuwa girlandę",
  "settings.christmasTitle": "Motyw świąteczny",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Tryb świąteczny",
  "settings.christmasHint": "Zimowa noc, śnieżne czapy na przyciskach i padający śnieg po każdym kliknięciu.",
  "settings.christmasGarlands": "Pudełko z girlandami",
  "settings.christmasGarlandsHint": "Przytrzymaj i przeciągnij girlandę w dowolne miejsce ekranu. Dwuklik lub prawy przycisk odkłada ją do pudełka.",
  "settings.garlandClassic": "Klasyczna",
  "settings.garlandGold": "Ciepłe złoto",
  "settings.garlandIce": "Lodowy błękit",
  "settings.garlandsPlaced": "Girlandy na ekranie: {n}",
  "settings.clearGarlands": "Usuń wszystkie girlandy",
  "settings.garlandsCleared": "Wszystkie girlandy wróciły do pudełka.",
  "settings.treeLights": "Girlanda na choince",
  "settings.treeLightsHint": "Możesz też kliknąć choinkę w tle.",
};
