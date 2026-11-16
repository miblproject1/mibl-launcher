import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { api, type TaskInfo } from "../lib/api";
import { useUi } from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Progress } from "./ui";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function speedText(task: TaskInfo, t: Translate): string {
  if (task.state !== "running" || task.speed <= 0) return "";
  const bytesLike =
    task.kind === "modrinth" ||
    task.kind === "import" ||
    task.kind === "export" ||
    task.speed > 120_000;
  if (bytesLike) {
    const mb = task.speed / (1024 * 1024);
    if (mb >= 0.1) return t("taskdock.mbPerSec", { n: mb.toFixed(1) });
    return t("taskdock.kbPerSec", { n: Math.max(1, Math.round(task.speed / 1024)) });
  }
  return t("taskdock.perSec", { n: Math.max(0, Math.round(task.speed)) });
}

/** Задача завершена: либо backend сказал done, либо прогресс дошёл до 100%. */
function isComplete(task: TaskInfo): boolean {
  return task.state === "done" || (task.total > 0 && task.done >= task.total);
}

/** Задача всё ещё реально выполняется (а не просто висит на 100%). */
function isRunning(task: TaskInfo): boolean {
  return task.state === "running" && !(task.total > 0 && task.done >= task.total);
}

export function TaskDock({
  lifted = false,
  onTaskDone,
}: {
  lifted?: boolean;
  onTaskDone?: () => void;
}) {
  const { t } = useUi();
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const seenRunning = useRef(false);
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    api.tasks().then((list) => alive && setTasks(list)).catch(() => {});
    const un = listen<TaskInfo[]>("tasks", (e) => {
      if (!alive) return;
      setTasks(e.payload);
    });
    return () => {
      alive = false;
      un.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Мгновенно обновляем сборки, как только задача дошла до 100%.
  useEffect(() => {
    let changed = false;
    for (const task of tasks) {
      if (isComplete(task) && !notified.current.has(task.id)) {
        notified.current.add(task.id);
        changed = true;
      }
    }
    if (changed) onTaskDone?.();
  }, [tasks, onTaskDone]);

  // Автоматически убираем задачу через 1.5 секунды после завершения.
  useEffect(() => {
    const timers: number[] = [];
    tasks.forEach((task) => {
      if (isComplete(task) && !dismissed.has(task.id)) {
        const timer = window.setTimeout(() => {
          setDismissed((prev) => new Set(prev).add(task.id));
        }, 1500);
        timers.push(timer);
      }
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [tasks, dismissed]);

  const visible = useMemo(
    () => tasks.filter((t) => !dismissed.has(t.id)).slice(0, 6),
    [tasks, dismissed],
  );
  const running = tasks.filter((t) => !dismissed.has(t.id) && isRunning(t)).length;

  useEffect(() => {
    if (running > 0 && !seenRunning.current) {
      seenRunning.current = true;
      setOpen(true);
    }
    if (running === 0) seenRunning.current = false;
  }, [running]);

  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed right-4 z-[60] w-[336px]",
        lifted ? "bottom-[104px]" : "bottom-4",
      )}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="mb-2 overflow-hidden rounded-xl border-2 border-white/15 bg-[#161821]/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold text-white/90">
                <Icon name="download" size={14} className="text-[var(--accent)]" />
                {t("taskdock.title")}
                {running > 0 && (
                  <span className="rounded-full bg-[var(--accent)]/25 px-1.5 py-[1px] text-[9.5px] font-bold text-white">
                    {running}
                  </span>
                )}
              </div>
              <button
                onClick={() => api.clearTasks().catch(() => {})}
                className="text-[10px] font-medium text-white/50 transition-colors hover:text-white/85"
              >
                {t("taskdock.clear")}
              </button>
            </div>

            <div className="max-h-[268px] space-y-2.5 overflow-y-auto px-3 py-2.5">
              <AnimatePresence initial={false}>
                {visible.map((task) => {
                  const pct =
                    task.total > 0
                      ? Math.min(100, Math.round((task.done / task.total) * 100))
                      : task.state === "done"
                        ? 100
                        : 0;
                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="text-[11px]"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-white/90">{task.title}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isRunning(task) && (
                            <span className="text-[10px] font-semibold text-[var(--accent)]">
                              {speedText(task, t)}
                            </span>
                          )}
                          {(task.state === "done" || isComplete(task)) && (
                            <Icon name="check" size={12} className="text-emerald-300" />
                          )}
                          {task.state === "error" && (
                            <Icon name="alert" size={12} className="text-rose-300" />
                          )}
                          <button
                            onClick={() =>
                              setDismissed((prev) => new Set(prev).add(task.id))
                            }
                            className="text-white/35 transition-colors hover:text-white/80"
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </span>
                      </div>
                      <Progress
                        value={task.state === "done" ? Math.max(task.total, 1) : task.done}
                        total={task.state === "done" ? Math.max(task.total, 1) : task.total}
                        active={isRunning(task)}
                        thin
                      />
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/55">
                        <span className="truncate">
                          {task.state === "error"
                            ? task.detail || t("taskdock.error")
                            : isComplete(task) && task.state === "done"
                              ? t("taskdock.done")
                              : task.detail || "…"}
                        </span>
                        <span className="shrink-0 font-medium">
                          {task.state === "error"
                            ? ""
                            : task.state === "done"
                              ? "100%"
                              : task.total > 0
                                ? `${pct}%`
                                : ""}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "ml-auto flex items-center gap-2 rounded-xl border-2 border-white/15 bg-[#161821]/95 px-3 py-2 text-[11.5px] font-semibold text-white/85 shadow-2xl backdrop-blur-xl transition-colors hover:border-white/25 hover:text-white",
          running > 0 && "pulse-glow",
        )}
      >
        <span className="relative flex h-2 w-2">
          {running > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-70" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              running > 0 ? "bg-[var(--accent)]" : "bg-emerald-400",
            )}
          />
        </span>
        {running > 0 ? t("taskdock.loading", { n: running }) : t("taskdock.completed")}
        <Icon
          name="chevron"
          size={12}
          className={cn("transition-transform", open ? "-rotate-90" : "rotate-90")}
        />
      </button>
    </div>
  );
}
