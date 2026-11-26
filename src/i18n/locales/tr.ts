import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const tr: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "Noel süsleri kutusu",
  "christmas.boxShort": "Hediyeyi aç",
  "christmas.enabled": "Noel teması açıldı! Mutlu Noeller!",
  "christmas.disabled": "Noel teması kapatıldı.",
  "christmas.treeHint": "Girlandayı yakmak için ağaca tıklayın",
  "christmas.removeHint": "Girlandayı kaldırmak için çift tıklayın veya sağ tıklayın",
  "settings.christmasTitle": "Noel teması",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "Noel modu",
  "settings.christmasHint": "Karlı kış gecesi, düğmelerde kar başlıkları ve her tıklamada kar yağışı.",
  "settings.christmasGarlands": "Girlanda kutusu",
  "settings.christmasGarlandsHint": "Bir girlandayı basılı tutup ekranın herhangi bir yerine sürükleyin. Çift tıklama veya sağ tık kutunun içine geri koyar.",
  "settings.garlandClassic": "Klasik",
  "settings.garlandGold": "Sıcak altın",
  "settings.garlandIce": "Buz mavisi",
  "settings.garlandsPlaced": "Ekrandaki girlandalar: {n}",
  "settings.clearGarlands": "Tüm girlandaları kaldır",
  "settings.garlandsCleared": "Tüm girlandalar kutuya geri döndü.",
  "settings.treeLights": "Ağaç girlandası",
  "settings.treeLightsHint": "Arka plandaki ağaca da tıklayabilirsiniz.",
};
