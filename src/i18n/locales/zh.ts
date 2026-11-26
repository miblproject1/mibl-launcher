import type { TranslationKey } from "./ru";
import { en } from "./en";

/** TODO(2.7.0): заменить на полноценный перевод. Пока — английский фолбэк. */
export const zh: Record<TranslationKey, string> = {
  ...en,
  "christmas.boxTitle": "圣诞装饰盒",
  "christmas.boxShort": "打开礼物",
  "christmas.enabled": "圣诞主题已开启！圣诞快乐！",
  "christmas.disabled": "圣诞主题已关闭。",
  "christmas.treeHint": "点击圣诞树点亮彩灯",
  "christmas.removeHint": "双击或右键可移除彩灯",
  "settings.christmasTitle": "圣诞主题",
  "settings.christmasBadge": "2.7.0 · Christmas",
  "settings.christmasMode": "圣诞模式",
  "settings.christmasHint": "雪夜背景、按钮上的积雪，以及每次点击飘落的雪花。",
  "settings.christmasGarlands": "彩灯盒",
  "settings.christmasGarlandsHint": "按住彩灯并拖到屏幕任意位置。双击或右键可放回盒子。",
  "settings.garlandClassic": "经典",
  "settings.garlandGold": "暖金色",
  "settings.garlandIce": "冰蓝色",
  "settings.garlandsPlaced": "屏幕上的彩灯：{n}",
  "settings.clearGarlands": "移除所有彩灯",
  "settings.garlandsCleared": "所有彩灯已放回盒子。",
  "settings.treeLights": "圣诞树彩灯",
  "settings.treeLightsHint": "也可以点击背景中的圣诞树。",
};
