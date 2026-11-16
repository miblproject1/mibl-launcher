import { lazy, Suspense } from "react";
import {
  LOADER_NAMES,
  formatPlaytime,
  type AccountView,
  type InstanceView,
} from "../lib/api";
import { hudStyle, useUi } from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Badge, Button, GlassCard, Spinner } from "./ui";

const HeroSkinViewer = lazy(() => import("./HeroSkinViewer"));

interface Props {
  account: AccountView | null;
  instances: InstanceView[];
  selected: string;
  onSelect: (name: string) => void;
  onOpenSettings: () => void;
  onOpenInstances: () => void;
  onOpenModpacks: () => void;
  onOpenHud: () => void;
}

function accountKindKey(account: AccountView | null): TranslationKey {
  if (!account) return "common.guest";
  if (account.type === "microsoft") return "kind.microsoft";
  if (account.type === "ely") return "kind.ely";
  return "kind.offline";
}

export default function HomeTab({
  account,
  instances,
  selected,
  onSelect,
  onOpenSettings,
  onOpenInstances,
  onOpenModpacks,
  onOpenHud,
}: Props) {
  const { pixel, layout, hud, t } = useUi();
  const instance = instances.find((item) => item.name === selected) ?? instances[0] ?? null;
  const showHero = layout.hero;

  // Последние/любимые сборки: свежие по времени запуска, затем остальные.
  const recent = [...instances]
    .sort((a, b) => {
      const diff = (b.last_played || 0) - (a.last_played || 0);
      if (Math.abs(diff) > 0.0001) return diff;
      return (b.created || 0) - (a.created || 0);
    })
    .slice(0, 3);

  const totalMods = instances.reduce((sum, item) => sum + item.mods_count, 0);
  const totalSeconds = instances.reduce((sum, item) => sum + item.playtime_seconds, 0);
  const totalHours = instances.reduce((sum, item) => sum + item.playtime_hours, 0);

  const hero = showHero ? (
    <Suspense
      fallback={
        <GlassCard className="flex min-h-[500px] items-center justify-center">
          <Spinner size={24} />
        </GlassCard>
      }
    >
      <HeroSkinViewer
        account={account}
        onOpenSkinSettings={onOpenSettings}
        className="flex-1"
      />
    </Suspense>
  ) : (
    <GlassCard className="flex min-h-[500px] flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon name="users" size={46} className="text-white/40" />
      <div className="text-[12px] muted">{t("home.heroOff")}</div>
      <Button variant="outline" icon="settings" onClick={onOpenSettings}>
        {t("home.enableHero")}
      </Button>
    </GlassCard>
  );

  return (
    <div className="fade-up flex min-h-full flex-col">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-none tracking-tight text-[var(--fg)]">
            {t("home.title")}
          </h1>
          <p className="mt-2 text-[12.5px] muted">
            {account
              ? t("home.welcomeBack", { name: account.name, kind: t(accountKindKey(account)) })
              : t("home.welcome")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" icon="grid" onClick={onOpenHud}>
            {t("home.hudEditor")}
          </Button>
          <Button variant="primary" icon="grid" onClick={onOpenInstances}>
            {t("home.allInstances")}
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-[252px_1fr_248px]">
        {/* ------------------------------------------------ левая колонка */}
        <aside
          data-hud="left"
          data-hud-label={t("hud.left")}
          style={hudStyle(hud.left)}
          className={cn(
            "hud-el flex min-w-0 flex-col gap-3",
            pixel ? "text-[var(--fg)]" : "",
          )}
        >
          <div className="rounded-xl border border-white/8 bg-slate-950/50 p-2.5 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] muted">
                <Icon name="clock" size={12} className="text-[var(--accent)]" />
                {t("home.lastInstances")}
              </div>
              <Badge tone="accent">{instances.length}</Badge>
            </div>

            {recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center">
                <Icon name="cube" size={24} className="mx-auto text-white/30" />
                <div className="mt-1.5 text-[10.5px] muted">{t("home.noInstances")}</div>
              </div>
            ) : (
              <div className="space-y-1">
                {recent.map((item) => {
                  const active = item.name === instance?.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => onSelect(item.name)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
                        active
                          ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                          : "border-white/8 bg-black/10 hover:border-white/20 hover:bg-white/[0.06]",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/25 text-[16px]">
                        {item.icon_url ? (
                          <img src={item.icon_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          item.icon ?? "🎮"
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold">
                          {item.name}
                        </span>
                        <span className="block truncate text-[9px] muted">
                          {item.mc_version} · {LOADER_NAMES[item.loader] ?? item.loader}
                        </span>
                      </span>
                      {item.version_ready ? (
                        <Icon name="check" size={12} className="shrink-0 text-emerald-300" />
                      ) : (
                        <Icon name="download" size={12} className="shrink-0 text-amber-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenInstances}
            className="surface-card group flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-line)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] transition-transform group-hover:scale-105">
              <Icon name="plus" size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11.5px] font-semibold">{t("home.newInstance")}</span>
              <span className="block text-[9px] muted">{t("home.newInstanceHint")}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenModpacks}
            className="surface-card group flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-line)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 transition-transform group-hover:scale-105">
              <Icon name="package" size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11.5px] font-semibold">{t("home.modpackCatalog")}</span>
              <span className="block text-[9px] muted">{t("home.modpackCatalogHint")}</span>
            </span>
          </button>
        </aside>

        {/* --------------------------------------------- центральная колонка */}
        <section
          data-hud="hero"
          data-hud-label={t("hud.hero")}
          style={hudStyle(hud.hero)}
          className="hud-el flex min-h-[500px] min-w-0 flex-col"
        >
          {hero}
        </section>

        {/* ------------------------------------------------ правая колонка */}
        <aside
          data-hud="right"
          data-hud-label={t("hud.right")}
          style={hudStyle(hud.right)}
          className="hud-el flex min-w-0 flex-col gap-3"
        >
          <div className="rounded-xl border border-white/8 bg-slate-950/50 p-2.5 backdrop-blur-md">
            <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] muted">
              <Icon name="layers" size={12} className="text-[var(--accent)]" />
              {t("home.summary")}
            </div>
            <div className="space-y-1.5">
              <SummaryRow
                icon="cube"
                label={t("home.instances")}
                value={String(instances.length)}
                tone="accent"
              />
              <SummaryRow icon="package" label={t("home.mods")} value={String(totalMods)} />
              <SummaryRow
                icon="clock"
                label={t("home.playtime")}
                value={formatPlaytime(totalHours, totalSeconds)}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: "cube" | "package" | "clock";
  label: string;
  value: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/10 px-2 py-1.5">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
          tone === "accent"
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "bg-white/[0.05] text-white/55",
        )}
      >
        <Icon name={icon} size={12} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[9.5px] muted">{label}</span>
      <span className="shrink-0 text-[12px] font-semibold text-[var(--fg)]">{value}</span>
    </div>
  );
}
