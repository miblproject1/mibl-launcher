import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AccountView } from "../lib/api";
import { useUi } from "../context/UiContext";
import { Icon } from "./Icon";
import { SkinHead } from "./ui";
import appIcon from "../assets/app-icon.png";

export function TitleBar({
  account,
  onOpenSettings,
}: {
  account?: AccountView | null;
  onOpenSettings?: () => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const { t } = useUi();

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const win = getCurrentWindow();

  return (
    <header
      data-tauri-drag-region
      className="title-drag relative z-40 flex h-[42px] shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-black/20 px-3 backdrop-blur-md"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <img
          src={appIcon}
          alt="Mibl Launcher"
          draggable={false}
          className="h-[22px] w-[22px] shrink-0 rounded-lg object-cover shadow-[0_4px_14px_-4px_var(--accent)]"
        />
        <span className="logo-pixel shrink-0 text-[12px] font-semibold tracking-[0.08em] text-white/90">
          MIBL LAUNCHER
        </span>
        <span className="hidden h-3 w-px shrink-0 bg-white/15 sm:block" />
        <span className="hidden truncate text-[11px] font-medium text-white/55 sm:block">
          {t("titlebar.localMode")}
        </span>
      </div>

      <div className="no-drag flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex max-w-[190px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-left transition-colors hover:border-white/20 hover:bg-white/[0.08]"
          title={t("titlebar.quickSettings")}
        >
          <SkinHead url={account?.skin_data_url} size={22} />
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-[10.5px] font-semibold text-white/90">
              {account?.name ?? t("common.player")}
            </span>
            <span className="text-[8px] uppercase tracking-wide text-white/45">
              {account?.type === "microsoft"
                ? t("kind.microsoft")
                : account?.type === "ely"
                  ? t("kind.ely")
                  : t("kind.offline")}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title={t("titlebar.settings")}
          aria-label={t("titlebar.settings")}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
        >
          <Icon name="settings" size={15} />
        </button>

        <span className="mx-0.5 h-4 w-px bg-white/15" />

        <button
          className="flex h-[26px] w-[34px] items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => win.minimize()}
          title={t("titlebar.minimize")}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          className="flex h-[26px] w-[34px] items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => win.toggleMaximize()}
          title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        >
          <Icon name={maximized ? "restore" : "maximize"} size={13} />
        </button>
        <button
          className="flex h-[26px] w-[34px] items-center justify-center rounded-md text-white/70 transition-colors hover:bg-rose-500/80 hover:text-white"
          onClick={() => win.close()}
          title={t("titlebar.close")}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  );
}
