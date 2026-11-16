import { useState } from "react";
import {
  api,
  LOADER_NAMES,
  type AccountView,
  type InstanceView,
} from "../lib/api";
import { UI_LANGUAGES, hudStyle, hudVariantClass, useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import { cn, errorText } from "../lib/utils";
import { Icon } from "./Icon";
import { Button, SkinHead } from "./ui";
import { CustomSelect } from "./CustomSelect";

interface Props {
  instances: InstanceView[];
  selected: string;
  onSelect: (name: string) => void;
  onRefresh: () => Promise<void>;
  account: AccountView | null;
  onOpenSettings: () => void;
}

export function LaunchDock({
  instances,
  selected,
  onSelect,
  onRefresh,
  account,
  onOpenSettings,
}: Props) {
  const { patch, layout, pixel, hud, t } = useUi();
  const { addNotification } = useNotifications();
  const [busy, setBusy] = useState(false);

  const instance =
    instances.find((item) => item.name === selected) ?? instances[0] ?? null;
  const language = instance?.game_language || layout.language || "ru_ru";
  const ready = Boolean(instance?.version_ready);

  const launch = async () => {
    if (!instance || busy) return;
    setBusy(true);
    try {
      if (!instance.version_ready) {
        await api.installInstance(instance.name);
        addNotification({
          type: "info",
          message: t("launch.installing", { name: instance.name }),
        });
        await onRefresh();
      } else {
        const info = await api.launchInstance(instance.name);
        addNotification({
          type: "success",
          message: t("launch.launched", { name: info.instance, args: info.arg_count }),
        });
      }
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const changeLanguage = async (code: string) => {
    patch({ language: code });
    if (!instance) return;
    try {
      await api.updateInstance(instance.name, { game_language: code });
      await onRefresh();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-2 pb-2 sm:px-3 sm:pb-3">
      <div
        className={cn(
          "launch-dock pointer-events-auto mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-2.5 border-2 border-white/15 bg-[#0E1017]/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl sm:gap-3 sm:px-4",
          pixel ? "rounded-[4px]" : "rounded-xl",
        )}
      >
        {/* Плашка выбранной сборки */}
        <div
          data-hud="instance"
          data-hud-label={t("hud.instance")}
          style={hudStyle(hud.instance)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5",
            hudVariantClass(hud.instance),
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] text-[20px]">
            {instance?.icon ?? "🎮"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="pixel-tag text-[8.5px] font-bold uppercase tracking-[0.2em] text-white/45">
              {t("launch.today")}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13.5px] font-bold text-white">
                {instance?.name ?? t("launch.noInstance")}
              </span>
              {instance && (
                <span className="hidden shrink-0 rounded border border-white/10 bg-white/[0.05] px-1.5 py-[1px] text-[9px] font-semibold text-white/60 sm:inline">
                  {instance.mc_version} · {LOADER_NAMES[instance.loader] ?? instance.loader}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Выбор сборки */}
        <div className="w-full min-w-[150px] sm:w-[190px]">
          <CustomSelect
            placement="up"
            value={instance?.name ?? ""}
            onChange={(event) => onSelect(event.target.value)}
          >
            {instances.length === 0 ? (
              <option value="">{t("launch.noInstancesOption")}</option>
            ) : (
              instances.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))
            )}
          </CustomSelect>
        </div>

        {/* Язык игры */}
        <div className="flex w-full min-w-[136px] items-center gap-1.5 sm:w-[160px]">
          <Icon name="globe" size={14} className="shrink-0 text-white/45" />
          <CustomSelect
            placement="up"
            value={language}
            onChange={(event) => void changeLanguage(event.target.value)}
          >
            {UI_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </CustomSelect>
        </div>

        {/* Аккаунт */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07] md:flex"
          title={t("launch.quickSettings")}
        >
          <SkinHead url={account?.skin_data_url} size={26} />
          <span className="min-w-0">
            <span className="block max-w-[104px] truncate text-[11px] font-semibold text-white/90">
              {account?.name ?? t("common.player")}
            </span>
            <span className="block text-[8.5px] uppercase tracking-wide text-white/45">
              {account?.type === "microsoft"
                ? t("kind.microsoft")
                : account?.type === "ely"
                  ? t("kind.ely")
                  : t("kind.offline")}
            </span>
          </span>
        </button>

        <Button
          variant={ready ? "play" : "primary"}
          size="md"
          icon={ready ? "play" : "download"}
          loading={busy}
          disabled={!instance}
          onClick={() => void launch()}
          data-hud="play"
          data-hud-label={t("hud.play")}
          style={hudStyle(hud.play)}
          className={cn(
            "h-11 min-w-[126px] flex-1 justify-center px-5 text-[13px] font-bold sm:flex-none",
            hudVariantClass(hud.play),
          )}
        >
          {ready ? t("launch.play") : t("launch.install")}
        </Button>
      </div>
    </div>
  );
}
