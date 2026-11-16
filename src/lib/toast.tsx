import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-3), { id, text, kind }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed right-4 top-14 z-[80] flex w-[320px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn(
                "glass flex items-start gap-2.5 px-3.5 py-3 text-[12px] leading-snug",
                item.kind === "success" && "border-emerald-300/30",
                item.kind === "error" && "border-rose-300/35",
              )}
            >
              <span
                className={cn(
                  "mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  item.kind === "success" && "bg-emerald-400/18 text-emerald-200",
                  item.kind === "error" && "bg-rose-400/18 text-rose-200",
                  item.kind === "info" && "bg-[var(--accent)]/20 text-[var(--accent)]",
                )}
              >
                <Icon
                  name={item.kind === "success" ? "check" : item.kind === "error" ? "alert" : "sparkles"}
                  size={13}
                />
              </span>
              <span className="whitespace-pre-line text-[var(--fg)]/95">{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
