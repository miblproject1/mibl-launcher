import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const pt: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Caixa de enfeites de Natal",
  "christmas.boxShort": "Abrir presente",
  "christmas.enabled": "Tema de Natal ativado! Feliz Natal!",
  "christmas.disabled": "Tema de Natal desativado.",
  "christmas.treeHint": "Clique na árvore para acender a guirlanda",
  "christmas.removeHint": "Clique duplo ou botão direito remove a guirlanda",
  "settings.christmasTitle": "Tema de Natal",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Modo de Natal",
  "settings.christmasHint": "Noite de inverno com neve, camadas de neve nos botões e neve caindo a cada clique.",
  "settings.christmasGarlands": "Caixa de guirlandas",
  "settings.christmasGarlandsHint": "Segure e arraste uma guirlanda para qualquer lugar da tela. Clique duplo ou botão direito devolve à caixa.",
  "settings.garlandClassic": "Clássica",
  "settings.garlandGold": "Dourado quente",
  "settings.garlandIce": "Azul gelado",
  "settings.garlandsPlaced": "Guirlandas na tela: {n}",
  "settings.clearGarlands": "Remover todas as guirlandas",
  "settings.garlandsCleared": "Todas as guirlandas voltaram para a caixa.",
  "settings.treeLights": "Guirlanda da árvore",
  "settings.treeLightsHint": "Você também pode clicar na árvore ao fundo.",
};
