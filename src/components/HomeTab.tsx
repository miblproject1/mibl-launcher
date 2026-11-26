import { lazy, Suspense } from "react";
import type { AccountView } from "../lib/api";
import { hudStyle, hudVariantClass, useUi } from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Button, SkinHead } from "./ui";

const HeroSkinViewer = lazy(() => import("./HeroSkinViewer"));

interface Props {
  account: AccountView | null;
  onOpenSettings: () => void;
  onOpenHud: () => void;
}

function accountKindKey(account: AccountView | null): TranslationKey {
  if (!account) return "common.guest";
  if (account.type === "microsoft") return "kind.microsoft";
  if (account.type === "ely") return "kind.ely";
  return "kind.offline";
}

/**
 * Главный экран 2.6: только большой 3D-персонаж по центру и компактная
 * плашка аккаунта под ногами. Всё остальное — в доке запуска и HUD.
 */
export default function HomeTab({ account, onOpenSettings, onOpenHud }: Props) {
  const { layout, hud, t } = useUi();

  return (
    <div className="fade-up relative flex min-h-[calc(100dvh-150px)] flex-col">
      <div className="flex justify-end px-1">
        <Button variant="ghost" size="xs" icon="grid" onClick={onOpenHud}>
          {t("home.hudShort")}
        </Button>
      </div>

      <div
        data-hud="hero"
        data-hud-label={t("hud.hero")}
        style={hudStyle(hud.hero)}
        className="hud-el relative flex flex-1 items-stretch justify-center px-4 pb-24 pt-2"
      >
        {layout.hero ? (
          <Suspense fallback={null}>
            <HeroSkinViewer
              bare
              account={account}
              onOpenSkinSettings={onOpenSettings}
              className="min-h-[420px]"
            />
          </Suspense>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <Icon name="users" size={46} className="text-white/40" />
            <div className="text-[12px] muted">{t("home.heroOff")}</div>
            <Button variant="outline" icon="settings" onClick={onOpenSettings}>
              {t("home.enableHero")}
            </Button>
          </div>
        )}
      </div>

      {/* Плашка аккаунта под ногами персонажа */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center px-4">
        <div
          data-hud="account"
          data-hud-label={t("hud.account")}
          style={hudStyle(hud.account)}
          className={cn(
            "pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur-xl",
            hudVariantClass(hud.account),
          )}
        >
          <SkinHead url={account?.skin_data_url} size={26} />
          <span className="min-w-0 max-w-[180px] truncate text-[12px] font-semibold text-[var(--fg)]">
            {account?.name ?? t("common.player")}
          </span>
          <span className="hidden text-[9px] font-semibold uppercase tracking-wide muted sm:block">
            {t(accountKindKey(account))}
          </span>
          <Button variant="soft" size="xs" icon="image" onClick={onOpenSettings}>
            {account ? t("hero.skin") : t("hero.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
