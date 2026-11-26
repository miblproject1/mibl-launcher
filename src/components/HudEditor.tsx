import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HUD_KEYS,
  useUi,
  type HudKey,
  type HudVariant,
} from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Button, Segmented, Slider, Toggle } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const VARIANTS: Array<{ key: HudVariant; labelKey: TranslationKey }> = [
  { key: "glass", labelKey: "hud.glass" },
  { key: "solid", labelKey: "hud.solid" },
  { key: "outline", labelKey: "hud.outline" },
  { key: "ghost", labelKey: "hud.ghost" },
];

const HUD_LABEL_KEYS: Record<HudKey, TranslationKey> = {
  instance: "hud.instance",
  play: "hud.play",
  hero: "hud.hero",
  account: "hud.account",
  nav: "hud.nav",
};

const HUD_DESC_KEYS: Record<HudKey, TranslationKey> = {
  instance: "hud.desc.instance",
  play: "hud.desc.play",
  hero: "hud.desc.hero",
  account: "hud.desc.account",
  nav: "hud.desc.nav",
};

/**
 * Визуальный редактор HUD: сетка поверх главного экрана, перетаскивание
 * настоящих элементов мышью и панель «Сохранить / Сбросить / Готово».
 */
export function HudEditor({ open, onClose, onSaved }: Props) {
  const { hud, patchHud, resetHud, t } = useUi();
  const [selected, setSelected] = useState<HudKey>("play");
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("hud-editing");

    const targetKey = (node: EventTarget | null): HudKey | null => {
      if (!(node instanceof HTMLElement)) return null;
      const element = node.closest<HTMLElement>("[data-hud]");
      const key = element?.dataset.hud as HudKey | undefined;
      return key && HUD_KEYS.includes(key) ? key : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const key = targetKey(event.target);
      if (!key) return;
      // В режиме редактирования элементы не должны запускать свои действия.
      event.preventDefault();
      event.stopPropagation();
      setSelected(key);
      const startX = event.clientX;
      const startY = event.clientY;
      const base = hudRef.current[key];

      const onMove = (move: PointerEvent) => {
        patchHud(key, {
          x: Math.round(base.x + (move.clientX - startX)),
          y: Math.round(base.y + (move.clientY - startY)),
        });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    const onClick = (event: MouseEvent) => {
      if (!targetKey(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      root.classList.remove("hud-editing");
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, patchHud, onClose]);

  if (!open) return null;
  const element = hud[selected];

  return createPortal(
    <>
      {/* Координатная сетка поверх интерфейса */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[105]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(94,106,210,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(94,106,210,0.22) 1px, transparent 1px), linear-gradient(rgba(94,106,210,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(94,106,210,0.08) 1px, transparent 1px)",
          backgroundSize: "160px 160px, 160px 160px, 40px 40px, 40px 40px",
        }}
      />
      <div className="pointer-events-none fixed inset-0 z-[106] bg-black/15" />

      <aside className="hud-panel glass-strong fixed right-3 top-[52px] z-[130] flex max-h-[calc(100vh-210px)] w-[334px] flex-col overflow-hidden rounded-2xl border border-[var(--accent-line)] shadow-2xl">
        <header className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white">
              <Icon name="grid" size={14} className="text-[var(--accent)]" />
              {t("home.hudEditor")}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-white/55">
              {t("hud.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t("hud.close")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Icon name="close" size={13} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {HUD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[10.5px] font-medium transition-colors",
                  selected === key
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-white"
                    : "border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    hud[key].visible ? "bg-emerald-400" : "bg-white/25",
                  )}
                />
                <span className="min-w-0 truncate">{t(HUD_LABEL_KEYS[key])}</span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11.5px] font-semibold text-white">{t(HUD_LABEL_KEYS[selected])}</div>
              <Toggle
                checked={element.visible}
                onChange={(visible) => patchHud(selected, { visible })}
              />
            </div>
            <p className="mt-1 text-[9.5px] leading-snug text-white/50">
              {t(HUD_DESC_KEYS[selected])}
            </p>

            <div className="mt-3">
              <Slider
                label={t("hud.size")}
                value={element.scale}
                min={0.6}
                max={1.6}
                step={0.05}
                display={`${Math.round(element.scale * 100)}%`}
                onChange={(scale) => patchHud(selected, { scale })}
                leftLabel="60%"
                rightLabel="160%"
              />
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold text-[var(--fg)]/85">{t("hud.style")}</div>
              <Segmented
                options={VARIANTS.map((variant) => ({ key: variant.key, label: t(variant.labelKey) }))}
                value={element.variant}
                onChange={(variant) => patchHud(selected, { variant })}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <ColorField
                label={t("hud.bg")}
                value={element.bg}
                fallback="#161624"
                onChange={(bg) => patchHud(selected, { bg })}
              />
              <ColorField
                label={t("hud.text")}
                value={element.fg}
                fallback="#EDEEF2"
                onChange={(fg) => patchHud(selected, { fg })}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button
                variant="soft"
                size="xs"
                icon="refresh"
                onClick={() => patchHud(selected, { x: 0, y: 0, scale: 1 })}
              >
                {t("hud.resetPosition")}
              </Button>
              <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-[9.5px] text-white/55">
                X {element.x} · Y {element.y}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-2.5 text-[9.5px] leading-relaxed text-white/70">
            <span className="flex items-center gap-1 font-semibold text-white">
              <Icon name="info" size={11} className="text-[var(--accent)]" />
              {t("hud.tip")}
            </span>
            {t("hud.tipText")}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <Button variant="primary" size="xs" icon="save" onClick={() => onSaved?.()}>
            {t("common.save")}
          </Button>
          <Button variant="outline" size="xs" icon="refresh" onClick={resetHud}>
            {t("common.reset")}
          </Button>
          <Button variant="soft" size="xs" icon="check" onClick={onClose}>
            {t("hud.done")}
          </Button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const { t } = useUi();
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || fallback}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-white/15 bg-transparent p-0.5"
          title={t("hud.colorLabel", { label: label.toLowerCase() })}
        />
        <input
          type="text"
          value={value}
          placeholder={t("hud.auto")}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-full min-w-0 rounded-md border border-white/10 bg-[#0F1116] px-1.5 font-mono text-[9.5px] text-white/80 focus:border-[var(--accent-line)] focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title={t("hud.resetColor")}
            className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/50 hover:text-white"
          >
            <Icon name="close" size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
