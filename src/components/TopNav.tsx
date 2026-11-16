import { motion } from "framer-motion";
import type { PageKey } from "../lib/api";
import { useUi } from "../context/UiContext";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { NAV } from "./Sidebar";

export function TopNav({
  page,
  onChange,
  instancesCount,
}: {
  page: PageKey;
  onChange: (page: PageKey) => void;
  instancesCount: number;
}) {
  const { t } = useUi();
  return (
    <div className="relative z-30 shrink-0 border-b border-white/8 bg-black/25 px-3 backdrop-blur-xl">
      <nav className="mx-auto flex w-full max-w-[1560px] items-center gap-1 overflow-x-auto py-1.5 no-scrollbar">
        {NAV.map((item) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[11.5px] font-semibold transition-colors",
                active ? "text-white" : "text-white/65 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-top"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg border border-[var(--accent-line)] bg-[var(--accent)]/20"
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon
                  name={item.icon}
                  size={15}
                  className={active ? "text-[var(--accent)]" : "text-white/55"}
                />
                <span className="ui-nav-label">{t(item.labelKey)}</span>
                {item.key === "instances" && instancesCount > 0 && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-[1px] text-[9px] font-bold text-white/90">
                    {instancesCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
