import { useCallback } from "react";
import type { ReactNode } from "react";
import { ToastProvider, useToast } from "../lib/toast";
import type { NotificationItem } from "../types";

export { ToastProvider } from "../lib/toast";

type ToastKind = "success" | "error" | "info";

export function NotificationProvider({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function useNotifications() {
  const toast = useToast();

  const addNotification = useCallback(
    (notification: Omit<NotificationItem, "id">) => {
      const kind: ToastKind =
        notification.type === "success"
          ? "success"
          : notification.type === "error"
            ? "error"
            : "info";
      toast(notification.message, kind);
    },
    [toast],
  );

  const removeNotification = useCallback((_id: string) => {
    // Тосты скрываются автоматически; метод оставлен для совместимости API.
  }, []);

  return { addNotification, removeNotification };
}
