import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const es: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Caja de adornos navideños",
  "christmas.boxShort": "Abrir regalo",
  "christmas.enabled": "¡Tema navideño activado! ¡Feliz Navidad!",
  "christmas.disabled": "Tema navideño desactivado.",
  "christmas.treeHint": "Haz clic en el árbol para encender la guirnalda",
  "christmas.removeHint": "Doble clic o clic derecho para quitar la guirnalda",
  "settings.christmasTitle": "Tema navideño",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Modo navideño",
  "settings.christmasHint": "Noche de invierno nevada, copos de nieve en los botones y nieve al hacer clic.",
  "settings.christmasGarlands": "Caja de guirnaldas",
  "settings.christmasGarlandsHint": "Mantén y arrastra una guirnalda a cualquier lugar de la pantalla. Doble clic o clic derecho la devuelve a la caja.",
  "settings.garlandClassic": "Clásica",
  "settings.garlandGold": "Oro cálido",
  "settings.garlandIce": "Azul hielo",
  "settings.garlandsPlaced": "Guirnaldas en pantalla: {n}",
  "settings.clearGarlands": "Quitar todas las guirnaldas",
  "settings.garlandsCleared": "Todas las guirnaldas vuelven a la caja.",
  "settings.treeLights": "Guirnalda del árbol",
  "settings.treeLightsHint": "También puedes hacer clic en el árbol del fondo.",
};
