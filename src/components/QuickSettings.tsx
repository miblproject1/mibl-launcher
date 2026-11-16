import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  type AccountView,
  type Config,
  type SystemInfo,
} from "../lib/api";
import { UI_LANGUAGES, useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import { cn, copyText, errorText, isValidNick } from "../lib/utils";
import { Icon } from "./Icon";
import {
  Badge,
  Button,
  Field,
  IconButton,
  Modal,
  SectionTitle,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from "./ui";
import { CustomSelect } from "./CustomSelect";
import { MicrosoftLoginModal } from "./MicrosoftLogin";

type TabKey = "main" | "advanced";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: AccountView[];
  selected: number;
  config: Config;
  system: SystemInfo;
  onAccounts: (accounts: AccountView[], selected: number) => void;
  onConfig: (config: Config) => void;
  onOpenFull: () => void;
}

export function QuickSettings({
  open,
  onClose,
  accounts,
  selected,
  config,
  system,
  onAccounts,
  onConfig,
  onOpenFull,
}: Props) {
  const { addNotification } = useNotifications();
  const { layout, patch, t } = useUi();
  const [tab, setTab] = useState<TabKey>("main");
  const [form, setForm] = useState<Config>(config);
  const [saving, setSaving] = useState(false);
  const [offlineName, setOfflineName] = useState("");
  const [elyUser, setElyUser] = useState("");
  const [elyPass, setElyPass] = useState("");
  const [msOpen, setMsOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setForm(config);
      setTab("main");
    }
  }, [open, config]);

  const activeIndex = useMemo(() => {
    const found = accounts.findIndex((account) => account.active);
    return found >= 0 ? found : Math.min(Math.max(selected, 0), Math.max(accounts.length - 1, 0));
  }, [accounts, selected]);
  const active = accounts[activeIndex] ?? null;

  const maxRam = Math.max(
    2048,
    Math.min(65536, Math.floor(system.total_ram_mb / 512) * 512 - 1024),
  );

  const setBusyKey = (key: string, value: boolean) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveConfig({
        ...form,
        jvm_args: form.jvm_args.map((line) => line.trim()).filter(Boolean),
      });
      onConfig(saved);
      addNotification({ type: "success", message: t("quick.saved") });
      onClose();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const addOffline = async () => {
    if (!isValidNick(offlineName)) {
      addNotification({ type: "warning", message: t("settings.nickRule") });
      return;
    }
    setBusyKey("offline", true);
    try {
      const result = await api.addOffline(offlineName.trim());
      onAccounts(result[0], result[1]);
      setOfflineName("");
      addNotification({ type: "success", message: t("quick.offlineAdded", { name: offlineName.trim() }) });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusyKey("offline", false);
    }
  };

  const loginEly = async () => {
    if (!elyUser.trim() || !elyPass) {
      addNotification({ type: "warning", message: t("quick.elyCredentials") });
      return;
    }
    setBusyKey("ely", true);
    try {
      const result = await api.elyLogin(elyUser.trim(), elyPass);
      onAccounts(result[0], result[1]);
      setElyUser("");
      setElyPass("");
      addNotification({ type: "success", message: t("settings.elyLoggedIn") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusyKey("ely", false);
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

  const openData = async () => {
    try {
      await api.openPath(system.data_dir);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const copyData = async () => {
    const copied = await copyText(system.data_dir);
    addNotification({
      type: copied ? "success" : "error",
      message: copied ? t("settings.pathCopied") : t("settings.pathCopyFailed"),
    });
  };

  const optimizeRam = async () => {
    setBusyKey("ram", true);
    try {
      const plan = await api.defaultJvm();
      setForm((prev) => ({ ...prev, ram_mb: plan.ram_mb, default_ram_mb: plan.ram_mb }));
      addNotification({ type: "info", message: t("quick.ramRecommendation", { ram: plan.ram_mb }) });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusyKey("ram", false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={t("quick.title")}
      subtitle={t("quick.subtitle")}
      width={640}
      footer={
        <>
          <Button variant="ghost" icon="settings" onClick={onOpenFull}>
            {t("quick.allSettings")}
          </Button>
          <Button variant="soft" onClick={onClose} disabled={saving}>
            {t("common.close")}
          </Button>
          <Button variant="primary" icon="save" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
        <TabButton active={tab === "main"} onClick={() => setTab("main")} icon="bolt">
          {t("quick.tabMain")}
        </TabButton>
        <TabButton active={tab === "advanced"} onClick={() => setTab("advanced")} icon="wrench">
          {t("quick.tabAdvanced")}
        </TabButton>
      </div>

      {tab === "main" ? (
        <div className="space-y-5">
          {/* RAM */}
          <section>
            <SectionTitle
              icon="server"
              right={
                <button
                  type="button"
                  onClick={() => void optimizeRam()}
                  className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
                >
                  {busy.ram ? t("quick.optimizing") : t("quick.optimize")}
                </button>
              }
            >
              {t("quick.ram")}
            </SectionTitle>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <Slider
                value={form.ram_mb}
                min={1024}
                max={maxRam}
                step={512}
                display={`${(form.ram_mb / 1024).toFixed(form.ram_mb % 1024 === 0 ? 0 : 1)} · ${t("inst.mb", { n: form.ram_mb })}`}
                onChange={(ram_mb) => setForm((prev) => ({ ...prev, ram_mb }))}
                leftLabel={t("settings.gb", { n: 1 })}
                rightLabel={t("settings.gb", { n: Math.round(maxRam / 1024) })}
              />
            </div>
          </section>

          {/* Аккаунт */}
          <section>
            <SectionTitle
              icon="users"
              right={
                <Badge tone={active && active.type !== "offline" ? "accent" : "neutral"}>
                  {active
                    ? `${active.name} · ${
                        active.type === "microsoft"
                          ? t("kind.microsoft")
                          : active.type === "ely"
                            ? t("kind.ely")
                            : t("kind.offline")
                      }`
                    : t("quick.noAccount")}
                </Badge>
              }
            >
              {t("quick.account")}
            </SectionTitle>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--fg)]/80">
                <Icon name="globe" size={13} className="text-[var(--accent)]" />
                {t("quick.license")}
              </div>
              <Button variant="primary" size="xs" icon="globe" onClick={() => setMsOpen(true)}>
                {t("quick.msLogin")}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-[10.5px] font-semibold text-white/75">{t("quick.offlineNick")}</div>
                <TextInput
                  value={offlineName}
                  onChange={(event) => setOfflineName(event.target.value)}
                  placeholder={t("quick.nickPlaceholder")}
                  maxLength={16}
                  onKeyDown={(event) => event.key === "Enter" && void addOffline()}
                />
                <Button
                  variant="soft"
                  icon="plus"
                  className="mt-2 w-full"
                  loading={busy.offline}
                  onClick={() => void addOffline()}
                >
                  {t("quick.playAs")}
                </Button>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-[10.5px] font-semibold text-white/75">{t("quick.elyLogin")}</div>
                <div className="space-y-1.5">
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
                    onKeyDown={(event) => event.key === "Enter" && void loginEly()}
                  />
                </div>
                <Button
                  variant="primary"
                  icon="play"
                  className="mt-2 w-full"
                  loading={busy.ely}
                  onClick={() => void loginEly()}
                >
                  {t("quick.login")}
                </Button>
              </div>
            </div>
          </section>

          {/* Язык и стиль */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <SectionTitle icon="globe">{t("quick.gameLanguage")}</SectionTitle>
              <CustomSelect
                value={form.game_language}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, game_language: event.target.value }))
                }
              >
                {UI_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </CustomSelect>
              <p className="mt-1 text-[9.5px] leading-snug text-white/40">
                {t("quick.gameLanguageHint")}
              </p>
            </div>
            <div>
              <SectionTitle icon="palette">{t("quick.uiStyle")}</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <StyleButton
                  active={layout.style === "pixel"}
                  title="2.4"
                  subtitle={t("quick.pixel")}
                  onClick={() => patch({ style: "pixel", nav: "top" })}
                />
                <StyleButton
                  active={layout.style === "modern"}
                  title="2.3.3"
                  subtitle={t("quick.modern")}
                  onClick={() => patch({ style: "modern", nav: "left" })}
                />
              </div>
            </div>
          </section>

          <section className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <Icon name="minimize" size={15} className="text-[var(--accent)]" />
              <div>
                <div className="text-[11.5px] font-semibold text-white/85">
                  {t("quick.autoMinimize")}
                </div>
                <div className="text-[9.5px] text-white/45">
                  {t("quick.autoMinimizeHint")}
                </div>
              </div>
            </div>
            <Toggle
              checked={form.auto_minimize}
              onChange={(auto_minimize) => setForm((prev) => ({ ...prev, auto_minimize }))}
            />
          </section>
        </div>
      ) : (
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
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, java_path: event.target.value }))
                }
                placeholder={t("quick.javaPlaceholder")}
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

          <Field label={t("quick.launcherFolder")} hint={t("quick.launcherFolderHint")}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 font-mono text-[10px] text-white/60">
                <span className="block truncate">{system.data_dir}</span>
              </div>
              <Button variant="soft" icon="folder" onClick={() => void openData()}>
                {t("settings.open")}
              </Button>
              <Button variant="ghost" icon="copy" onClick={() => void copyData()}>
                {t("common.copy")}
              </Button>
            </div>
          </Field>

          <Field
            label={t("quick.jvm")}
            hint={t("quick.jvmHint")}
          >
            <TextArea
              value={form.jvm_args.join("\n")}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  jvm_args: event.target.value.split(/\r?\n/),
                }))
              }
              placeholder={"-XX:+UseG1GC\n-XX:MaxGCPauseMillis=200"}
              className="min-h-[110px] font-mono text-[11px]"
            />
          </Field>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-white/80">
              <Icon name="info" size={14} className="text-[var(--accent)]" />
              {t("quick.layout")}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={layout.nav === "left" ? "primary" : "outline"}
                size="xs"
                onClick={() => patch({ nav: "left" })}
              >
                {t("quick.navLeft")}
              </Button>
              <Button
                variant={layout.nav === "top" ? "primary" : "outline"}
                size="xs"
                onClick={() => patch({ nav: "top" })}
              >
                {t("quick.navTop")}
              </Button>
              <Button
                variant={layout.dock === "always" ? "primary" : "outline"}
                size="xs"
                onClick={() => patch({ dock: "always" })}
              >
                {t("quick.dockAlways")}
              </Button>
              <Button
                variant={layout.dock === "home" ? "primary" : "outline"}
                size="xs"
                onClick={() => patch({ dock: "home" })}
              >
                {t("quick.dockHome")}
              </Button>
              <Button
                variant={layout.hero ? "primary" : "outline"}
                size="xs"
                onClick={() => patch({ hero: !layout.hero })}
              >
                {layout.hero ? t("quick.heroOn") : t("quick.heroOff")}
              </Button>
            </div>
            <p className="mt-2 text-[9.5px] text-white/40">
              {t("quick.layoutHint")}
            </p>
          </div>
        </div>
      )}
    </Modal>
    <MicrosoftLoginModal open={msOpen} onClose={() => setMsOpen(false)} onAccounts={onAccounts} />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: "bolt" | "wrench";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold transition-colors",
        active
          ? "border border-[var(--accent-line)] bg-[var(--accent)]/20 text-white"
          : "text-white/55 hover:bg-white/[0.05] hover:text-white",
      )}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  );
}

function StyleButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-2.5 text-left transition-colors",
        active
          ? "border-[var(--accent-line)] bg-[var(--accent)]/18"
          : "border-white/10 bg-black/20 hover:border-white/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-white">{title}</span>
        {active && <Icon name="check" size={13} className="text-[var(--accent)]" />}
      </div>
      <div className="text-[9.5px] uppercase tracking-wider text-white/45">{subtitle}</div>
    </button>
  );
}
