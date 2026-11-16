import { motion } from "framer-motion";
import type { AccountView, PageKey } from "../lib/api";
import { useUi } from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn } from "../lib/utils";
import { Icon, type IconName } from "./Icon";
import { SkinHead } from "./ui";

export const NAV: Array<{ key: PageKey; labelKey: TranslationKey; icon: IconName }> = [
  { key: "home", labelKey: "nav.home", icon: "home" },
  { key: "instances", labelKey: "nav.instances", icon: "grid" },
  { key: "content", labelKey: "nav.content", icon: "cube" },
  { key: "modpacks", labelKey: "nav.modpacks", icon: "package" },
  { key: "theme", labelKey: "nav.theme", icon: "palette" },
  { key: "settings", labelKey: "nav.settings", icon: "settings" },
];

export function Sidebar({
  page,
  onChange,
  account,
  instancesCount,
  onOpenLogs,
}: {
  page: PageKey;
  onChange: (page: PageKey) => void;
  account: AccountView | null;
  instancesCount: number;
  onOpenLogs: () => void;
}) {
  const { t } = useUi();
  return (
    <aside className="relative z-30 flex h-full w-[232px] shrink-0 flex-col border-r border-white/8 bg-black/25 backdrop-blur-xl">
      <div className="px-5 pb-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="logo-pixel text-[28px] font-bold leading-none tracking-[-0.03em] text-white">
            Mibl
          </span>
          <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
        </div>
        <div className="mt-1.5 text-[10px] font-semibold tracking-[0.34em] text-white/65">
          {t("sidebar.launcher")} 2.5.0
        </div>
        <div className="mt-2 text-[11px] font-medium text-white/60">
          {t("sidebar.tagline")}
        </div>
      </div>

      <nav className="flex flex-col gap-1.5 px-3">
        {NAV.map((item) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={cn(
                "group relative flex h-[42px] items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-semibold transition-colors",
                active ? "text-white" : "text-white/70 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-xl border border-[var(--accent-line)] bg-[var(--accent)]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                />
              )}
              <span className="relative flex h-full w-full items-center gap-3">
                <Icon
                  name={item.icon}
                  size={17}
                  className={cn(
                    "transition-colors",
                    active ? "text-[var(--accent)]" : "text-white/55 group-hover:text-white/80",
                  )}
                />
                <span className="ui-nav-label flex-1">{t(item.labelKey)}</span>
                {item.key === "instances" && instancesCount > 0 && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-[1px] text-[10px] font-bold text-white/90">
                    {instancesCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="px-3 pb-3">
        <button
          onClick={() => onChange("settings")}
          className="glass-soft group flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/6"
        >
          <SkinHead url={account?.skin_data_url} size={38} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-white/95">
              {account?.name ?? "Player"}
            </span>
            <span className="block truncate text-[10.5px] font-medium text-white/60">
              {account?.type === "ely" ? "Ely.by" : t("sidebar.offlineAccount")}
            </span>
          </span>
          <Icon name="chevron" size={14} className="text-white/45 transition-colors group-hover:text-white/80" />
        </button>

        <button
          onClick={onOpenLogs}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/8 hover:text-white"
        >
          <Icon name="folder" size={14} />
          {t("sidebar.launcherFolder")}
        </button>
      </div>
    </aside>
  );
}
