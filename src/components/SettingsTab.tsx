import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type AccountView, type Config, type SystemInfo } from "../lib/api";
import { useNotifications } from "../context/NotificationContext";
import { GARLAND_STYLES, UI_LANGUAGES, useUi, type GarlandStyle } from "../context/UiContext";
import { APP_LANGUAGES, type Language } from "../i18n/translations";
import { cn, copyText, errorText, isValidNick } from "../lib/utils";
import { Icon } from "./Icon";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  GlassCard,
  IconButton,
  Modal,
  PageHeader,
  SectionTitle,
  Slider,
  Spinner,
  TextInput,
  Toggle,
} from "./ui";
import { CustomSelect } from "./CustomSelect";
import { MicrosoftLoginModal } from "./MicrosoftLogin";
import { GarlandSvg } from "./ChristmasDecorLayer";

const SkinPreview = lazy(() =>
  import("./SkinPreview").then((module) => ({ default: module.SkinPreview })),
);

interface Props {
  accounts: AccountView[];
  selected: number;
  config: Config;
  system: SystemInfo;
  onAccounts: (accounts: AccountView[], selected: number) => void;
  onConfig: (config: Config) => void;
  onSystem: (system: SystemInfo) => void;
}

export default function SettingsTab({
  accounts,
  selected,
  config,
  system,
  onAccounts,
  onConfig,
  onSystem,
}: Props) {
  const { addNotification } = useNotifications();
  const { t, language, setLanguage } = useUi();
  const [form, setForm] = useState<Config>(config);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [offlineName, setOfflineName] = useState("");
  const [elyUser, setElyUser] = useState("");
  const [elyPass, setElyPass] = useState("");
  const [elyNick, setElyNick] = useState("");
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [msOpen, setMsOpen] = useState(false);

  const activeIndex = useMemo(() => {
    const found = accounts.findIndex((account) => account.active);
    if (found >= 0) return found;
    return Math.min(Math.max(selected, 0), Math.max(accounts.length - 1, 0));
  }, [accounts, selected]);

  const active = accounts[activeIndex] ?? null;

  useEffect(() => {
    setForm(config);
  }, [config]);

  const isBusy = (key: string) => Boolean(busy[key]);
  const setAction = (key: string, value: boolean) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });

  const applyAccounts = (result: [AccountView[], number]) => {
    onAccounts(result[0], result[1]);
  };

  const run = async (key: string, fn: () => Promise<void>, success?: string) => {
    setAction(key, true);
    try {
      await fn();
      if (success) addNotification({ type: "success", message: success });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setAction(key, false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const saved = await api.saveConfig(form);
      onConfig(saved);
      addNotification({ type: "success", message: t("settings.savedConfig") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const browseJava = async () => {
    try {
      const path = await api.pickFile("java");
      if (path) setForm((prev) => ({ ...prev, java_path: path }));
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const optimizeRam = async () => {
    setAction("optimize", true);
    try {
      const plan = await api.defaultJvm();
      setForm((prev) => ({ ...prev, ram_mb: plan.ram_mb, default_ram_mb: plan.ram_mb }));
      addNotification({
        type: "info",
        message: t("settings.ramRecommendation", { ram: plan.ram_mb, gc: plan.gc }),
      });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setAction("optimize", false);
    }
  };

  const refreshSystem = () =>
    run(
      "system",
      async () => {
        const info = await api.systemInfo();
        onSystem(info);
      },
      t("settings.systemRefreshed"),
    );

  const selectAccount = (index: number) =>
    run(`select:${index}`, async () => {
      applyAccounts(await api.selectAccount(index));
    });

  const addOffline = () => {
    if (!isValidNick(offlineName)) {
      addNotification({ type: "warning", message: t("settings.nickRule") });
      return;
    }
    void run(
      "offline",
      async () => {
        applyAccounts(await api.addOffline(offlineName.trim()));
        setOfflineName("");
      },
      t("settings.offlineAdded", { name: offlineName.trim() }),
    );
  };

  const loginEly = () => {
    if (!elyUser.trim() || !elyPass) {
      addNotification({ type: "warning", message: t("settings.elyCredentials") });
      return;
    }
    void run(
      "elyLogin",
      async () => {
        applyAccounts(await api.elyLogin(elyUser.trim(), elyPass));
        setElyUser("");
        setElyPass("");
      },
      t("settings.elyLoggedIn"),
    );
  };

  const addElyNick = () => {
    if (!isValidNick(elyNick)) {
      addNotification({ type: "warning", message: t("settings.elyNickRule") });
      return;
    }
    void run(
      "elyNick",
      async () => {
        applyAccounts(await api.elyNick(elyNick.trim()));
        setElyNick("");
      },
      t("settings.elyNickAdded", { name: elyNick.trim() }),
    );
  };

  const refreshMicrosoft = () =>
    run(
      "refreshSkin",
      async () => {
        applyAccounts(await api.refreshMicrosoft(activeIndex));
      },
      t("settings.msRefreshed"),
    );

  const refreshActiveAccount = () => {
    if (active?.type === "microsoft") {
      refreshMicrosoft();
      return;
    }
    refreshSkin();
  };

  const pickSkin = async () => {
    setAction("skin", true);
    try {
      const result = await api.pickSkin(activeIndex);
      if (result) {
        applyAccounts(result);
        addNotification({ type: "success", message: t("settings.skinUploaded") });
      }
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setAction("skin", false);
    }
  };

  const refreshSkin = () => {
    if (!active) return;
    void run(
      "refreshSkin",
      async () => {
        applyAccounts(await api.refreshSkin(activeIndex));
      },
      t("settings.skinRefreshed"),
    );
  };

  const openRename = () => {
    if (!active) return;
    setRenameValue(active.name);
    setRenaming(true);
  };

  const rename = () =>
    run(
      "rename",
      async () => {
        if (!isValidNick(renameValue)) throw new Error(t("settings.nickRule"));
        applyAccounts(await api.renameAccount(activeIndex, renameValue.trim()));
        setRenaming(false);
      },
      t("settings.renamed"),
    );

  const removeAccount = async () => {
    if (removeIndex === null) return;
    setAction("remove", true);
    try {
      applyAccounts(await api.removeAccount(removeIndex));
      setRemoveIndex(null);
      addNotification({ type: "success", message: t("settings.accountRemoved") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setAction("remove", false);
    }
  };

  const openData = () =>
    run(
      "data",
      async () => {
        await api.openPath(system.data_dir);
      },
      t("settings.folderOpened"),
    );

  const copyDataPath = async () => {
    const copied = await copyText(system.data_dir);
    addNotification({
      type: copied ? "success" : "error",
      message: copied ? t("settings.pathCopied") : t("settings.pathCopyFailed"),
    });
  };

  const maxRam = Math.max(2048, Math.min(65536, Math.floor(system.total_ram_mb / 512) * 512 - 1024));

  return (
    <div className="fade-up">
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        actions={
          <Button
            variant="outline"
            icon="external"
            onClick={() => void openUrl("https://ely.by").catch((error) => addNotification({ type: "error", message: errorText(error) }))}
          >
            {t("settings.openEly")}
          </Button>
        }
      />

      {/* Рождественская тема 2.7.0 */}
      <ChristmasSettings />

      {/* Язык интерфейса лаунчера — отдельно от языка игры Minecraft */}
      <GlassCard className="mb-4 p-4">
        <SectionTitle
          icon="globe"
          right={<Badge tone="accent">{t("settings.languageBadge")}</Badge>}
        >
          {t("settings.interfaceLanguage")}
        </SectionTitle>
        <div className="flex flex-col gap-3">
          <p className="text-[11px] leading-snug muted">
            {t("settings.interfaceLanguageHint")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {APP_LANGUAGES.map((item) => (
              <Button
                key={item.code}
                variant={language === item.code ? "primary" : "outline"}
                size="xs"
                className="flex w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                onClick={() => setLanguage(item.code)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Резервные копии миров */}
      <GlassCard className="mb-4 p-4">
        <SectionTitle icon="archive">{t("settings.backupsTitle")}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_240px] sm:items-start">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--fg)]">
                {t("settings.autoBackup")}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-snug muted">
                {t("settings.autoBackupHint")}
              </div>
            </div>
            <Toggle
              checked={Boolean(form.auto_backup_worlds)}
              onChange={(auto_backup_worlds) =>
                setForm((prev) => ({ ...prev, auto_backup_worlds }))
              }
            />
          </div>
          <Field label={t("settings.backupKeep")} hint={t("settings.backupKeepHint")}>
            <CustomSelect
              value={form.world_backup_keep ?? 5}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, world_backup_keep: Number(event.target.value) }))
              }
            >
              {[5, 7, 10].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </CustomSelect>
          </Field>
        </div>
      </GlassCard>

      {/* Оптимизация FPS */}
      <GlassCard className="mb-4 p-4">
        <SectionTitle icon="sparkles">{t("settings.fpsOptimization")}</SectionTitle>
        <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[var(--fg)]">
              {t("settings.fpsOptimizationHint")}
            </div>
            <div className="mt-0.5 text-[10.5px] leading-snug muted">
              {t("settings.fpsOptimizationSub")}
            </div>
          </div>
          <Toggle
            checked={Boolean(form.optimize_fps)}
            onChange={(optimize_fps) =>
              setForm((prev) => ({ ...prev, optimize_fps }))
            }
          />
        </div>
      </GlassCard>

      {/* Аккаунты */}
      <GlassCard className="mb-4 p-4">
        <SectionTitle
          icon="users"
          right={
            <Badge tone="accent">
              {accounts.length}{" "}
              {accounts.length === 1
                ? t("settings.accountCountOne")
                : t("settings.accountCount", { n: "" }).trim()}
            </Badge>
          }
        >
          {t("settings.accounts")}
        </SectionTitle>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/20 text-[var(--accent)]">
              <Icon name="globe" size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--fg)]">
                {t("settings.msTitle")}
              </div>
              <div className="text-[10px] leading-snug muted">
                {t("settings.msDesc")}
              </div>
            </div>
          </div>
          <Button variant="primary" icon="globe" onClick={() => setMsOpen(true)}>
            {t("settings.msLogin")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[232px_1fr]">
          <div className="flex flex-col gap-2">
            {active?.skin_data_url ? (
              <Suspense
                fallback={
                  <div className="flex h-[268px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/15">
                    <Spinner size={20} />
                  </div>
                }
              >
                <SkinPreview url={active.skin_data_url} width={232} height={268} className="w-full" />
              </Suspense>
            ) : (
              <div className="flex h-[268px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/15 text-white/55">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon name="users" size={30} />
                </div>
                <div className="text-[12px] font-semibold">{t("settings.skinMissing")}</div>
                <div className="max-w-[180px] text-center text-[10px] leading-snug">
                  {t("settings.skinMissingDesc")}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="primary" icon="image" className="flex-1" loading={isBusy("skin")} onClick={() => void pickSkin()}>
                {t("settings.skin")}
              </Button>
              <Button
                variant="outline"
                icon="refresh"
                loading={isBusy("refreshSkin")}
                disabled={!active?.ely_username && active?.type !== "microsoft"}
                onClick={refreshActiveAccount}
                title={
                  active?.type === "microsoft"
                    ? t("settings.refreshMsTitle")
                    : t("settings.refreshElyTitle")
                }
              >
                {t("settings.refresh")}
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="glass-soft flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">
                    {active?.name ?? t("settings.noAccount")}
                  </span>
                  {active && (
                    <Badge
                      tone={
                        active.type === "microsoft"
                          ? "success"
                          : active.type === "ely"
                            ? "accent"
                            : "neutral"
                      }
                    >
                      {active.type === "microsoft"
                        ? t("kind.microsoft")
                        : active.type === "ely"
                          ? t("kind.ely")
                          : t("kind.offline")}
                    </Badge>
                  )}
                  {active?.active && <Badge tone="success">{t("settings.active")}</Badge>}
                </div>
                <div className="mt-1 text-[10.5px] muted">
                  {active?.type === "microsoft"
                    ? t("settings.microsoftDesc")
                    : active?.ely_username
                      ? t("settings.elyProfile", { name: active.ely_username })
                      : t("settings.offlineProfile")}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="soft" icon="edit" onClick={openRename} disabled={!active}>
                  {t("settings.nick")}
                </Button>
                <Button
                  variant="ghost"
                  icon="trash"
                  className="text-rose-200 hover:bg-rose-500/15"
                  disabled={!active || accounts.length <= 1}
                  onClick={() => setRemoveIndex(activeIndex)}
                >
                  {t("settings.remove")}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {accounts.map((account, index) => (
                <button
                  key={`${account.name}-${index}`}
                  type="button"
                  onClick={() => void selectAccount(index)}
                  disabled={isBusy(`select:${index}`)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                    account.active
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                      : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/6",
                  )}
                >
                  <div
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-gradient-to-br from-[var(--accent)]/50 to-[var(--panel2)]"
                    style={
                      account.skin_data_url
                        ? {
                            backgroundImage: `url("${account.skin_data_url}")`,
                            backgroundSize: "800% 800%",
                            backgroundPosition: "-100% -100%",
                            imageRendering: "pixelated",
                          }
                        : undefined
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold">{account.name}</span>
                    <span className="block truncate text-[9.5px] muted">
                      {account.type === "microsoft"
                        ? t("kind.microsoft")
                        : account.type === "ely"
                          ? t("kind.ely")
                          : t("kind.offline")}
                    </span>
                  </span>
                  {account.active && <Icon name="check" size={13} className="text-[var(--accent)]" />}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
                  <Icon name="gamepad" size={13} className="text-[var(--accent)]" />
                  {t("settings.offlineAccount")}
                </div>
                <TextInput
                  value={offlineName}
                  onChange={(event) => setOfflineName(event.target.value)}
                  placeholder={t("settings.offlineNick")}
                  maxLength={16}
                  onKeyDown={(event) => event.key === "Enter" && addOffline()}
                />
                <Button
                  variant="soft"
                  icon="plus"
                  className="mt-2 w-full"
                  loading={isBusy("offline")}
                  onClick={addOffline}
                >
                  {t("settings.add")}
                </Button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
                  <Icon name="globe" size={13} className="text-[var(--accent)]" />
                  {t("settings.elyLogin")}
                </div>
                <div className="space-y-2">
                  <TextInput
                    value={elyUser}
                    onChange={(event) => setElyUser(event.target.value)}
                    placeholder={t("settings.elyUserPlaceholder")}
                    autoComplete="username"
                  />
                  <TextInput
                    type="password"
                    value={elyPass}
                    onChange={(event) => setElyPass(event.target.value)}
                    placeholder={t("settings.password")}
                    autoComplete="current-password"
                    onKeyDown={(event) => event.key === "Enter" && loginEly()}
                  />
                </div>
                <Button
                  variant="primary"
                  icon="play"
                  className="mt-2 w-full"
                  loading={isBusy("elyLogin")}
                  onClick={loginEly}
                >
                  {t("settings.login")}
                </Button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
                  <Icon name="sparkles" size={13} className="text-[var(--accent)]" />
                  {t("settings.skinByNick")}
                </div>
                <TextInput
                  value={elyNick}
                  onChange={(event) => setElyNick(event.target.value)}
                  placeholder={t("settings.nickPlaceholder")}
                  maxLength={16}
                  onKeyDown={(event) => event.key === "Enter" && addElyNick()}
                />
                <Button
                  variant="soft"
                  icon="download"
                  className="mt-2 w-full"
                  loading={isBusy("elyNick")}
                  onClick={addElyNick}
                >
                  {t("settings.addProfile")}
                </Button>
              </div>
            </div>

            {accounts.length === 0 && (
              <EmptyState
                icon="users"
                title={t("settings.noAccounts")}
                text={t("settings.noAccountsText")}
              />
            )}
          </div>
        </div>
      </GlassCard>

      {/* Java и память */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassCard className="p-4">
          <SectionTitle icon="settings" right={<Badge tone={form.java_path ? "success" : "warn"}>{form.java_path ? t("settings.pathSet") : t("settings.auto")}</Badge>}>
            {t("settings.javaMemory")}
          </SectionTitle>
          <div className="space-y-4">
            <Field
              label={t("settings.javaPath")}
              hint={
                system.java_hint
                  ? t("settings.javaFound", { path: system.java_hint })
                  : t("settings.javaNotFound")
              }
            >
              <div className="flex items-center gap-2">
                <TextInput
                  value={form.java_path}
                  onChange={(event) => setForm((prev) => ({ ...prev, java_path: event.target.value }))}
                  placeholder={t("settings.javaPlaceholder")}
                />
                <Button variant="outline" icon="folder" onClick={() => void browseJava()}>
                  {t("settings.browse")}
                </Button>
                {system.java_hint && (
                  <IconButton
                    icon="bolt"
                    label={t("settings.useFoundJava")}
                    onClick={() => setForm((prev) => ({ ...prev, java_path: system.java_hint ?? "" }))}
                  />
                )}
              </div>
            </Field>

            <Slider
              label={t("settings.ram")}
              value={form.ram_mb}
              min={1024}
              max={maxRam}
              step={512}
              display={t("settings.gb", { n: (form.ram_mb / 1024).toFixed(form.ram_mb % 1024 === 0 ? 0 : 1) })}
              onChange={(ram_mb) => setForm((prev) => ({ ...prev, ram_mb }))}
              leftLabel={t("settings.gb", { n: 1 })}
              rightLabel={t("settings.gb", { n: Math.round(maxRam / 1024) })}
            />

            <Slider
              label={t("settings.defaultRam")}
              value={form.default_ram_mb}
              min={1024}
              max={maxRam}
              step={512}
              display={t("settings.gb", { n: (form.default_ram_mb / 1024).toFixed(form.default_ram_mb % 1024 === 0 ? 0 : 1) })}
              onChange={(default_ram_mb) => setForm((prev) => ({ ...prev, default_ram_mb }))}
              leftLabel={t("settings.gb", { n: 1 })}
              rightLabel={t("settings.gb", { n: Math.round(maxRam / 1024) })}
            />

            <Field
              label={t("settings.gameLanguage")}
              hint={t("settings.gameLanguageHint")}
            >
              <CustomSelect
                value={form.game_language}
                onChange={(event) => setForm((prev) => ({ ...prev, game_language: event.target.value }))}
              >
                {UI_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </CustomSelect>
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[11.5px] font-semibold text-[var(--fg)]/85">
                  {t("settings.autoMinimize")}
                </div>
                <div className="text-[10px] leading-snug muted">
                  {t("settings.autoMinimizeHint")}
                </div>
              </div>
              <Toggle
                checked={form.auto_minimize}
                onChange={(auto_minimize) => setForm((prev) => ({ ...prev, auto_minimize }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="primary" icon="save" loading={saving} onClick={() => void saveConfig()}>
                {t("settings.save")}
              </Button>
              <Button variant="outline" icon="bolt" loading={isBusy("optimize")} onClick={() => void optimizeRam()}>
                {t("settings.optimize")}
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Система */}
        <GlassCard className="p-4">
          <SectionTitle icon="server" right={<Button variant="ghost" icon="refresh" loading={isBusy("system")} onClick={() => void refreshSystem()}>{t("common.refresh")}</Button>}>
            {t("settings.system")}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label={t("settings.totalRam")} value={t("settings.gb", { n: Math.round(system.total_ram_mb / 1024) })} />
            <InfoTile label={t("settings.instances")} value={String(system.instances)} />
            <InfoTile
              label={t("settings.javaStatus")}
              value={system.java_hint ? t("settings.javaFoundShort") : t("settings.javaMissingShort")}
              tone={system.java_hint ? "success" : "warn"}
            />
            <InfoTile label={t("settings.accountsCount")} value={String(accounts.length)} />
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider muted">{t("settings.launcherFolder")}</div>
            <div className="break-all font-mono text-[10.5px] leading-relaxed text-[var(--fg)]/70">{system.data_dir}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="soft" icon="folder" loading={isBusy("data")} onClick={() => void openData()}>
                {t("settings.open")}
              </Button>
              <Button variant="ghost" icon="copy" onClick={() => void copyDataPath()}>
                {t("settings.copyPath")}
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-[10.5px] leading-relaxed text-[var(--fg)]/75">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--fg)]">
              <Icon name="info" size={13} className="text-[var(--accent)]" />
              {t("settings.elyHow")}
            </div>
            {t("settings.elyHowText")}
          </div>
        </GlassCard>
      </div>

      {/* CurseForge: личный ключ нужен только для этого каталога. */}
      <GlassCard className="mb-4 p-4">
        <SectionTitle
          icon="package"
          right={
            <Badge tone={form.curseforge_api_key.trim() ? "success" : "warn"}>
              {form.curseforge_api_key.trim() ? "OK" : "API key"}
            </Badge>
          }
        >
          CurseForge
        </SectionTitle>
        <Field label={t("modpacks.curseKeyTitle")} hint={t("modpacks.curseKeyText")}>
          <div className="flex items-center gap-2">
            <TextInput
              type="password"
              value={form.curseforge_api_key}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, curseforge_api_key: event.target.value }))
              }
              placeholder="CurseForge API key"
            />
            <Button
              variant="outline"
              icon="external"
              onClick={() => void openUrl("https://console.curseforge.com/")}
            >
              {t("settings.open")}
            </Button>
            <Button
              variant="primary"
              icon="save"
              loading={saving}
              onClick={() => void saveConfig()}
            >
              {t("settings.save")}
            </Button>
          </div>
        </Field>
      </GlassCard>

      <ConfirmDialog
        open={removeIndex !== null}
        title={t("settings.removeConfirm")}
        text={
          removeIndex !== null
            ? t("settings.removeConfirmText", { name: accounts[removeIndex]?.name ?? "" })
            : ""
        }
        confirmLabel={t("settings.removeConfirmLabel")}
        busy={isBusy("remove")}
        onCancel={() => setRemoveIndex(null)}
        onConfirm={() => void removeAccount()}
      />

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title={t("settings.renameTitle")}
        subtitle={t("settings.renameSubtitle")}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" icon="save" loading={isBusy("rename")} onClick={() => void rename()}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <Field label={t("settings.newNick")} hint={t("settings.newNickHint")}>
          <TextInput
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={16}
            autoFocus
            onKeyDown={(event) => event.key === "Enter" && void rename()}
          />
        </Field>
      </Modal>

      <MicrosoftLoginModal open={msOpen} onClose={() => setMsOpen(false)} onAccounts={onAccounts} />
    </div>
  );
}

function ChristmasSettings() {
  const {
    t,
    christmas,
    setChristmas,
    treeLights,
    setTreeLights,
    garlands,
    addGarland,
    clearGarlands,
    setGarlandDraft,
  } = useUi();
  const { addNotification } = useNotifications();

  const toggleChristmas = (value: boolean) => {
    setChristmas(value);
    addNotification({
      type: value ? "success" : "info",
      message: t(value ? "christmas.enabled" : "christmas.disabled"),
    });
  };

  const beginDrag = (style: GarlandStyle, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!christmas) {
      setChristmas(true);
      addNotification({ type: "success", message: t("christmas.enabled") });
    }
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    setGarlandDraft({
      style,
      x: Math.min(99, Math.max(1, (event.clientX / width) * 100)),
      y: Math.min(99, Math.max(1, (event.clientY / height) * 100)),
    });
  };

  const garlandLabel = (style: GarlandStyle) =>
    style === "classic"
      ? t("settings.garlandClassic")
      : style === "gold"
        ? t("settings.garlandGold")
        : t("settings.garlandIce");

  const clearAll = () => {
    clearGarlands();
    addNotification({ type: "info", message: t("settings.garlandsCleared") });
  };

  return (
    <GlassCard className="mb-4 p-4">
      <SectionTitle
        icon="sparkles"
        right={<Badge tone="accent">{t("settings.christmasBadge")}</Badge>}
      >
        {t("settings.christmasTitle")}
      </SectionTitle>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--fg)]">
            {t("settings.christmasMode")}
          </div>
          <div className="mt-0.5 text-[10.5px] leading-snug muted">
            {t("settings.christmasHint")}
          </div>
        </div>
        <Toggle checked={christmas} onChange={toggleChristmas} />
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
          <Icon name="gift" size={13} className="text-[var(--accent)]" />
          {t("settings.christmasGarlands")}
        </div>
        <p className="mb-2.5 text-[10.5px] leading-snug muted">
          {t("settings.christmasGarlandsHint")}
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {GARLAND_STYLES.map((style) => (
            <div
              key={style}
              role="button"
              tabIndex={0}
              aria-label={garlandLabel(style)}
              onPointerDown={(event) => beginDrag(style, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  addGarland(style, 50, 35);
                  if (!christmas) setChristmas(true);
                }
              }}
              className={cn(
                "group flex cursor-grab touch-none select-none flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 transition-colors active:cursor-grabbing",
                christmas
                  ? "border-white/10 bg-black/20 hover:border-amber-200/45 hover:bg-black/30"
                  : "border-white/10 bg-black/20 opacity-75 hover:opacity-95",
              )}
            >
              <div className="pointer-events-none flex h-[38px] w-full items-center justify-center overflow-hidden">
                <GarlandSvg style={style} className="h-[38px] w-full" />
              </div>
              <span className="text-[10px] font-semibold leading-none">
                {garlandLabel(style)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
          <span className="text-[11px] muted">
            {t("settings.garlandsPlaced", { n: garlands.length })}
          </span>
          <Button
            variant="ghost"
            size="xs"
            icon="trash"
            disabled={garlands.length === 0}
            onClick={clearAll}
          >
            {t("settings.clearGarlands")}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-[var(--fg)]/85">
            {t("settings.treeLights")}
          </div>
          <div className="text-[10px] leading-snug muted">
            {t("settings.treeLightsHint")}
          </div>
        </div>
        <Toggle checked={treeLights} onChange={setTreeLights} />
      </div>
    </GlassCard>
  );
}

function InfoTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warn";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-2.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[15px] font-semibold",
          tone === "success" && "text-emerald-300",
          tone === "warn" && "text-amber-200",
          tone === "neutral" && "text-[var(--fg)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
