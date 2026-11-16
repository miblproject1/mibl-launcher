import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, type ThemePreset } from "../lib/api";
import { useTheme } from "../context/ThemeContext";
import { useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import type { TranslationKey } from "../i18n/translations";
import { accentAlpha, cn, errorText, fileUrl } from "../lib/utils";
import {
  CUSTOM_FONT_KEY,
  FONT_PRESETS,
  clampScale,
  isFontPath,
  typographyLabel,
} from "../lib/typography";
import { Icon } from "./Icon";
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  GlassCard,
  IconButton,
  PageHeader,
  SectionTitle,
  Slider,
  TextInput,
  Toggle,
} from "./ui";

const FONT_LABEL_KEYS: Record<string, TranslationKey> = {
  standard: "font.standard.label",
  pixel: "font.pixel.label",
  mono: "font.mono.label",
  rounded: "font.rounded.label",
};

const FONT_HINT_KEYS: Record<string, TranslationKey> = {
  standard: "font.standard.hint",
  pixel: "font.pixel.hint",
  mono: "font.mono.hint",
  rounded: "font.rounded.hint",
};

export default function CustomTab() {
  const { theme, presets, dirty, patchTheme, saveTheme, resetTheme } = useTheme();
  const { layout, patch, typography, patchTypography, saveTypographyNow, reset: resetLayout, t } = useUi();
  const { addNotification } = useNotifications();
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [picking, setPicking] = useState<"image" | "video" | "audio" | "font" | null>(null);
  const [fontSaved, setFontSaved] = useState(false);
  const fontSavedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (fontSavedTimer.current) window.clearTimeout(fontSavedTimer.current);
    },
    [],
  );

  const backgroundImage = useMemo(() => fileUrl(theme.bg_image), [theme.bg_image]);
  const backgroundVideo = useMemo(() => fileUrl(theme.bg_video), [theme.bg_video]);

  const applyPreset = (preset: ThemePreset) => {
    patchTheme({
      preset: preset.key,
      accent: preset.accent,
      bg: preset.bg,
      panel: preset.panel,
      panel2: preset.panel2,
      fg: preset.fg,
      muted: preset.muted,
    });
  };

  const pick = async (kind: "image" | "video" | "audio", field: "bg_image" | "bg_video" | "audio") => {
    setPicking(kind);
    try {
      const path = await api.pickFile(kind);
      if (path) {
        if (field === "bg_image") patchTheme({ bg_image: path });
        else if (field === "bg_video") patchTheme({ bg_video: path });
        else patchTheme({ audio: path });
      }
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setPicking(null);
    }
  };

  const pickFont = async () => {
    setPicking("font");
    try {
      const path = await api.pickFile("font");
      if (!path) return;
      if (!isFontPath(path)) {
        addNotification({
          type: "warning",
          message: t("custom.fontPickHint"),
        });
        return;
      }
      const name = path.split(/[\\/]/).pop() || t("custom.customFontName");
      patchTypography({ preset: CUSTOM_FONT_KEY, custom_path: path, custom_name: name });
      addNotification({ type: "success", message: t("custom.fontApplied", { name }) });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setPicking(null);
    }
  };

  const resetTypography = () => {
    patchTypography({ preset: "standard", custom_path: "", custom_name: "", scale: 100 });
    addNotification({ type: "info", message: t("custom.typographyReset") });
  };

  // Явное сохранение шрифта и масштаба: пишет их в localStorage и показывает
  // подтверждение «Сохранено ✓» на две секунды.
  const saveFont = () => {
    saveTypographyNow();
    setFontSaved(true);
    if (fontSavedTimer.current) window.clearTimeout(fontSavedTimer.current);
    fontSavedTimer.current = window.setTimeout(() => setFontSaved(false), 2000);
  };

  const save = async () => {
    setSaving(true);
    saveTypographyNow();
    try {
      await saveTheme();
      addNotification({ type: "success", message: t("custom.savedTheme") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await resetTheme();
      setConfirmReset(false);
      addNotification({ type: "info", message: t("custom.themeReset") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title={t("custom.title")}
        subtitle={t("custom.subtitle")}
        actions={
          <>
            {dirty && <Badge tone="warn">{t("custom.unsaved")}</Badge>}
            <Button variant="outline" icon="refresh" onClick={() => setConfirmReset(true)}>
              {t("common.reset")}
            </Button>
            <Button variant="primary" icon="save" onClick={() => void save()} loading={saving}>
              {t("custom.saveTheme")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Компоновка 2.4 */}
        <GlassCard className="p-4 xl:col-span-2">
          <SectionTitle icon="grid" right={<span className="text-[10.5px] muted">{t("custom.storageLocal")}</span>}>
            {t("custom.layoutTitle")}
          </SectionTitle>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => patch({ style: "pixel", nav: "top" })}
              className={cn(
                "relative overflow-hidden rounded-xl border p-3 text-left transition-all",
                layout.style === "pixel"
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                  : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-[var(--fg)]">{t("custom.pixelPreset")}</span>
                {layout.style === "pixel" && <Icon name="check" size={14} className="text-[var(--accent)]" />}
              </div>
              <p className="mt-1 text-[10px] leading-snug muted">
                {t("custom.pixelPresetDesc")}
              </p>
              <div className="mt-2 flex items-end gap-1">
                <span className="h-5 w-5 rounded-[2px] border-2 border-white/25 bg-[#5865F2]" />
                <span className="h-4 w-8 rounded-[2px] border-2 border-white/20 bg-[#2e5434]" />
                <span className="h-3 w-6 rounded-[2px] border-2 border-white/15 bg-[#0b0c10]" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => patch({ style: "modern", nav: "left" })}
              className={cn(
                "relative overflow-hidden rounded-xl border p-3 text-left transition-all",
                layout.style === "modern"
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                  : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-[var(--fg)]">{t("custom.modernPreset")}</span>
                {layout.style === "modern" && <Icon name="check" size={14} className="text-[var(--accent)]" />}
              </div>
              <p className="mt-1 text-[10px] leading-snug muted">
                {t("custom.modernPresetDesc")}
              </p>
              <div className="mt-2 flex items-end gap-1">
                <span className="h-4 w-10 rounded bg-[#5865F2]/80" />
                <span className="h-3 w-6 rounded bg-white/25" />
                <span className="h-3 w-5 rounded bg-white/15" />
              </div>
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold text-[var(--fg)]/80">{t("custom.navigation")}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant={layout.nav === "left" ? "primary" : "outline"} size="xs" onClick={() => patch({ nav: "left" })}>
                  {t("custom.left")}
                </Button>
                <Button variant={layout.nav === "top" ? "primary" : "outline"} size="xs" onClick={() => patch({ nav: "top" })}>
                  {t("custom.top")}
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold text-[var(--fg)]/80">{t("custom.dock")}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant={layout.dock === "always" ? "primary" : "outline"} size="xs" onClick={() => patch({ dock: "always" })}>
                  {t("custom.always")}
                </Button>
                <Button variant={layout.dock === "home" ? "primary" : "outline"} size="xs" onClick={() => patch({ dock: "home" })}>
                  {t("custom.homeOnly")}
                </Button>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold text-[var(--fg)]/80">{t("custom.hero3d")}</div>
              <Toggle
                checked={layout.hero}
                onChange={(hero) => patch({ hero })}
                label={layout.hero ? t("custom.enabled") : t("custom.disabled")}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
            <p className="text-[10px] leading-snug text-white/45">
              {t("custom.pixelNote")}
            </p>
            <Button
              variant="ghost"
              icon="refresh"
              size="xs"
              onClick={() => {
                resetLayout();
                addNotification({ type: "info", message: t("custom.layoutReset") });
              }}
            >
              {t("custom.resetLayout")}
            </Button>
          </div>
        </GlassCard>

        {/* Типографика 2.5 */}
        <GlassCard className="p-4 xl:col-span-2">
          <SectionTitle
            icon="font"
            right={<span className="text-[10.5px] muted">{t("custom.storageLocal")}</span>}
          >
            {t("custom.typography")}
          </SectionTitle>

          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <div>
              <div className="mb-2 text-[10.5px] font-semibold text-[var(--fg)]/80">
                {t("custom.fontPresets")}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {FONT_PRESETS.map((preset) => {
                  const active = typography.preset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() =>
                        patchTypography({ preset: preset.key, custom_path: "", custom_name: "" })
                      }
                      className={cn(
                        "relative overflow-hidden rounded-xl border p-2.5 text-left transition-all",
                        active
                          ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                          : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-preview truncate text-[12px] font-semibold text-[var(--fg)]"
                          style={{ fontFamily: preset.stack }}
                        >
                          {t(FONT_LABEL_KEYS[preset.key] ?? "font.standard.label")}
                        </span>
                        {active && <Icon name="check" size={13} className="shrink-0 text-[var(--accent)]" />}
                      </div>
                      <div
                        className="font-preview mt-1 text-[20px] leading-none"
                        style={{ fontFamily: preset.stack }}
                      >
                        Aa Бб 123
                      </div>
                      <p className="mt-1.5 text-[9.5px] leading-snug muted">
                        {t(FONT_HINT_KEYS[preset.key] ?? "font.standard.hint")}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--fg)]/85">
                    <Icon name="upload" size={13} className="text-[var(--accent)]" />
                    {t("custom.customFont")}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] muted">
                    {typography.custom_path
                      ? t("custom.fontSelected", { name: typographyLabel(typography) })
                      : t("custom.fontHint")}
                  </div>
                </div>
                <Button
                  variant="outline"
                  icon="folder"
                  loading={picking === "font"}
                  onClick={() => void pickFont()}
                >
                  {t("custom.chooseFont")}
                </Button>
                {typography.custom_path && (
                  <IconButton
                    icon="x"
                    label={t("custom.chooseFont")}
                    onClick={() =>
                      patchTypography({ preset: "standard", custom_path: "", custom_name: "" })
                    }
                  />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--fg)]/85">{t("custom.textScale")}</span>
                <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-[2px] text-[10.5px] font-bold text-[var(--accent)]">
                  {typography.scale}%
                </span>
              </div>
              <input
                type="range"
                className="range-accent mt-2"
                min={85}
                max={125}
                step={5}
                value={typography.scale}
                onChange={(event) =>
                  patchTypography({ scale: clampScale(Number(event.target.value)) })
                }
                style={
                  {
                    "--range-pct": `${((typography.scale - 85) / 40) * 100}%`,
                  } as CSSProperties
                }
              />
              <div className="mt-1 flex justify-between text-[9.5px] muted">
                <span>{t("custom.scaleCompact")}</span>
                <span>{t("custom.scaleLarge")}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[90, 100, 110, 120].map((value) => (
                  <Button
                    key={value}
                    variant={typography.scale === value ? "primary" : "outline"}
                    size="xs"
                    onClick={() => patchTypography({ scale: value })}
                  >
                    {value}%
                  </Button>
                ))}
                <Button variant="ghost" size="xs" icon="refresh" onClick={resetTypography}>
                  100%
                </Button>
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2.5">
                <div className="text-[9px] uppercase tracking-wider muted">{t("custom.preview")}</div>
                <div className="mt-1 text-[15px] font-semibold leading-tight text-[var(--fg)]">
                  Mibl Launcher 2.5.0
                </div>
                <div className="mt-1 text-[11px] leading-snug text-[var(--fg)]/75">
                  {t("custom.previewText")}
                </div>
                <div className="mt-1 text-[10px] muted">
                  {t("custom.fontLine", {
                    name:
                      typography.preset === CUSTOM_FONT_KEY && typography.custom_path
                        ? typographyLabel(typography)
                        : t(FONT_LABEL_KEYS[typography.preset] ?? "font.standard.label"),
                    scale: typography.scale,
                  })}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button
                  variant={fontSaved ? "success" : "primary"}
                  size="sm"
                  icon={fontSaved ? "check" : "save"}
                  onClick={saveFont}
                >
                  {fontSaved ? t("custom.fontSaved") : t("custom.saveFont")}
                </Button>
                <span className="text-[9.5px] muted">
                  {t("custom.fontStored")}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Пресеты */}
        <GlassCard className="p-4">
          <SectionTitle icon="palette" right={<span className="text-[10.5px] muted">{t("custom.backend")}</span>}>
            {t("custom.presets")}
          </SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const active = theme.preset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all",
                    active
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                      : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[var(--fg)]">{preset.name}</span>
                    {active && <Icon name="check" size={13} className="text-[var(--accent)]" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {[preset.accent, preset.bg, preset.panel, preset.panel2, preset.fg].map((color, index) => (
                      <span
                        key={`${preset.key}-${index}`}
                        className="h-5 flex-1 rounded-[5px] border border-white/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 text-[9.5px] uppercase tracking-wider muted">{preset.key}</div>
                </button>
              );
            })}
          </div>
        </GlassCard>

        {/* Цвета */}
        <GlassCard className="p-4">
          <SectionTitle icon="sun">{t("custom.colors")}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ColorField label={t("custom.accent")} value={theme.accent} onChange={(accent) => patchTheme({ accent })} />
            <ColorField label={t("custom.background")} value={theme.bg} onChange={(bg) => patchTheme({ bg })} />
            <ColorField label={t("custom.panel")} value={theme.panel} onChange={(panel) => patchTheme({ panel })} />
            <ColorField label={t("custom.panel2")} value={theme.panel2} onChange={(panel2) => patchTheme({ panel2 })} />
            <ColorField label={t("custom.fg")} value={theme.fg} onChange={(fg) => patchTheme({ fg })} />
            <ColorField label={t("custom.muted")} value={theme.muted} onChange={(muted) => patchTheme({ muted })} />
          </div>
          <div className="mt-4">
            <Slider
              label={t("custom.glass")}
              value={Math.round(theme.glass * 100)}
              min={10}
              max={100}
              step={1}
              display={`${Math.round(theme.glass * 100)}%`}
              onChange={(value) => patchTheme({ glass: value / 100 })}
              leftLabel={t("custom.glassTransparent")}
              rightLabel={t("custom.glassDense")}
            />
          </div>
          <div className="mt-4">
            <Slider
              label={t("custom.radius")}
              value={theme.radius}
              min={0}
              max={24}
              step={1}
              display={`${theme.radius}px`}
              onChange={(radius) => patchTheme({ radius })}
              leftLabel={t("custom.sharp")}
              rightLabel={t("custom.round")}
            />
          </div>
        </GlassCard>

        {/* Фон */}
        <GlassCard className="p-4">
          <SectionTitle icon="image">{t("custom.wallpaper")}</SectionTitle>
          <div className="space-y-4">
            <Field label={t("custom.image")} hint={t("custom.imageHint")}>
              <div className="flex items-center gap-2">
                <TextInput
                  value={theme.bg_image}
                  onChange={(event) => patchTheme({ bg_image: event.target.value })}
                  placeholder="C:\\Pictures\\background.jpg"
                />
                <Button
                  variant="outline"
                  icon="folder"
                  loading={picking === "image"}
                  onClick={() => void pick("image", "bg_image")}
                >
                  {t("custom.choose")}
                </Button>
                {theme.bg_image && (
                  <IconButton icon="x" label={t("custom.clearImage")} onClick={() => patchTheme({ bg_image: "" })} />
                )}
              </div>
            </Field>

            {backgroundImage && (
              <div className="h-24 overflow-hidden rounded-xl border border-white/10">
                <img src={backgroundImage} alt={t("custom.background")} className="h-full w-full object-cover" />
              </div>
            )}

            <Field label={t("custom.video")} hint={t("custom.videoHint")}>
              <div className="flex items-center gap-2">
                <TextInput
                  value={theme.bg_video}
                  onChange={(event) => patchTheme({ bg_video: event.target.value })}
                  placeholder="C:\\Videos\\background.mp4"
                />
                <Button
                  variant="outline"
                  icon="video"
                  loading={picking === "video"}
                  onClick={() => void pick("video", "bg_video")}
                >
                  {t("custom.choose")}
                </Button>
                {theme.bg_video && (
                  <IconButton icon="x" label={t("custom.clearVideo")} onClick={() => patchTheme({ bg_video: "" })} />
                )}
              </div>
            </Field>

            {backgroundVideo && (
              <div className="h-24 overflow-hidden rounded-xl border border-white/10">
                <video src={backgroundVideo} className="h-full w-full object-cover" muted autoPlay loop playsInline />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Slider
                label={t("custom.dim")}
                value={Math.round(theme.bg_dim * 100)}
                min={0}
                max={100}
                display={`${Math.round(theme.bg_dim * 100)}%`}
                onChange={(value) => patchTheme({ bg_dim: value / 100 })}
                leftLabel={t("custom.light")}
                rightLabel={t("custom.dark")}
              />
              <Slider
                label={t("custom.blur")}
                value={theme.bg_blur}
                min={0}
                max={24}
                step={0.5}
                display={`${theme.bg_blur.toFixed(1)} px`}
                onChange={(bg_blur) => patchTheme({ bg_blur })}
                leftLabel={t("custom.crisp")}
                rightLabel={t("custom.soft")}
              />
            </div>

            <Toggle
              checked={theme.bg_video_muted}
              onChange={(bg_video_muted) => patchTheme({ bg_video_muted })}
              label={t("custom.mutedVideo")}
            />
          </div>
        </GlassCard>

        {/* Музыка и звук */}
        <GlassCard className="p-4">
          <SectionTitle
            icon="music"
            right={<span className="text-[10.5px] muted">MP3 / OGG / WAV</span>}
          >
            {t("custom.musicTitle")}
          </SectionTitle>
          <div className="space-y-4">
            <Field
              label={t("custom.musicFile")}
              hint={t("custom.musicHintLong")}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  value={theme.audio}
                  onChange={(event) => patchTheme({ audio: event.target.value })}
                  placeholder="C:\\Music\\ambient.mp3"
                />
                <Button
                  variant="outline"
                  icon="music"
                  loading={picking === "audio"}
                  onClick={() => void pick("audio", "audio")}
                >
                  {t("custom.choose")}
                </Button>
                {theme.audio && (
                  <IconButton icon="x" label={t("custom.clearMusic")} onClick={() => patchTheme({ audio: "" })} />
                )}
              </div>
            </Field>

            <Slider
              label={t("custom.musicVolume")}
              value={Math.round(theme.volume * 100)}
              min={0}
              max={100}
              display={`${Math.round(theme.volume * 100)}%`}
              onChange={(value) => patchTheme({ volume: value / 100 })}
              leftLabel={t("custom.quiet")}
              rightLabel={t("custom.loud")}
            />
          </div>
        </GlassCard>

        {/* Превью */}
        <GlassCard className="p-4 xl:col-span-2">
          <SectionTitle icon="sparkles" right={<span className="text-[10.5px] muted">{t("custom.livePreview")}</span>}>
            {t("custom.appearance")}
          </SectionTitle>
          <div
            className="relative overflow-hidden rounded-xl border border-white/10"
            style={{
              backgroundColor: theme.bg,
              color: theme.fg,
              fontFamily: `"${theme.font}", "Segoe UI", sans-serif`,
              minHeight: 260,
            }}
          >
            {(backgroundVideo || backgroundImage) && (
              <div className="absolute inset-0 overflow-hidden">
                {backgroundVideo ? (
                  <video
                    src={backgroundVideo}
                    className="h-full w-full object-cover"
                    muted={theme.bg_video_muted}
                    autoPlay
                    loop
                    playsInline
                    style={{ filter: `blur(${theme.bg_blur}px)` }}
                  />
                ) : (
                  <img
                    src={backgroundImage ?? ""}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ filter: `blur(${theme.bg_blur}px)` }}
                  />
                )}
                <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.bg_dim})` }} />
              </div>
            )}

            <div className="relative flex min-h-[260px]">
              <div
                className="flex w-[124px] shrink-0 flex-col gap-1 border-r p-2.5"
                style={{
                  borderColor: accentAlpha(theme.fg, 0.1),
                  backgroundColor: accentAlpha(theme.panel, 0.45),
                }}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black"
                    style={{ backgroundColor: theme.accent, color: "#fff" }}
                  >
                    M
                  </span>
                  <span className="text-[11px] font-bold">Mibl</span>
                </div>
                {[
                  t("custom.previewNavInstances"),
                  t("custom.previewNavMods"),
                  t("custom.previewNavTheme"),
                ].map((item, index) => (
                  <div
                    key={item}
                    className="rounded-md px-2 py-1.5 text-[9.5px] font-semibold"
                    style={
                      index === 0
                        ? { backgroundColor: accentAlpha(theme.accent, 0.2), color: theme.fg }
                        : { color: theme.muted }
                    }
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="flex-1 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-semibold">{t("custom.previewNavInstances")}</div>
                    <div className="text-[8.5px]" style={{ color: theme.muted }}>
                      {t("custom.previewSubtitle")}
                    </div>
                  </div>
                  <span
                    className="rounded-md px-2 py-1 text-[8.5px] font-bold"
                    style={{ backgroundColor: theme.accent, color: "#fff" }}
                  >
                    {t("custom.previewCreate")}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-lg border"
                      style={{
                        borderColor: accentAlpha(theme.fg, 0.12),
                        backgroundColor: accentAlpha(theme.panel, theme.glass),
                      }}
                    >
                      <div
                        className="h-10"
                        style={{
                          background: `linear-gradient(135deg, ${theme.accent}, ${theme.panel2})`,
                          opacity: 1 - index * 0.16,
                        }}
                      />
                      <div className="space-y-1 p-1.5">
                        <div className="h-1.5 w-4/5 rounded" style={{ backgroundColor: accentAlpha(theme.fg, 0.55) }} />
                        <div className="h-1 w-2/5 rounded" style={{ backgroundColor: accentAlpha(theme.muted, 0.65) }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-2 flex items-center justify-between rounded-lg border px-2 py-1.5"
                  style={{
                    borderColor: accentAlpha(theme.accent, 0.45),
                    backgroundColor: accentAlpha(theme.panel2, theme.glass),
                  }}
                >
                  <span className="text-[8.5px]" style={{ color: theme.muted }}>
                    1.20.1 · Fabric
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[8px] font-bold"
                    style={{ backgroundColor: theme.accent, color: "#fff" }}
                  >
                    {t("custom.previewPlay")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t("custom.resetConfirm")}
        text={t("custom.resetText")}
        confirmLabel={t("common.reset")}
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold text-[var(--fg)]/80">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-11 shrink-0"
          aria-label={label}
        />
        <TextInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-[11px] uppercase"
        />
      </div>
    </div>
  );
}
