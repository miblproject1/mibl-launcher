// Единый источник моделей — src/lib/api.ts.
// Файл оставлен для обратной совместимости импортов из старых компонентов.
export * from "./lib/api";

export interface NotificationItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}
