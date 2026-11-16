import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  LOADERS,
  LOADER_NAMES,
  MC_VERSION_FALLBACK,
  formatPlaytime,
  type AccountView,
  type CrashReport,
  type GameExit,
  type InstanceView,
  type Loader,
  type SystemInfo,
  type UltraFpsResult,
} from "../lib/api";
import { useNotifications } from "../context/NotificationContext";
import { UI_LANGUAGES, useUi } from "../context/UiContext";
import {
  cn,
  copyText,
  coverGradient,
  errorText,
  formatNumber,
  formatRelative,
} from "../lib/utils";
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
  Slider,
  Spinner,
  TextArea,
  TextInput,
} from "./ui";
import { CustomSelect } from "./CustomSelect";

const HeroSkinViewer = lazy(() => import("./HeroSkinViewer"));

const ICONS = [
  "🎮", "⚔️", "🌲", "🔮", "🚀", "🏰", "⚡", "💎", "🐉", "🌋", "🧭", "🛡️",
  "🧪", "⚙️", "🌌", "🔥", "❄️", "👑", "🏹", "🧱", "🌿", "💀", "🛸", "🎯",
];

/** Имя по умолчанию: «<Загрузчик> <Версия>», пока пользователь не изменил его вручную. */
function defaultInstanceName(loader: Loader, version: string): string {
  const loaderName = LOADER_NAMES[loader] ?? LOADER_NAMES.vanilla ?? "Vanilla";
  const cleanVersion = version.trim() || "1.20.1";
  return `${loaderName} ${cleanVersion}`;
}

interface Props {
  instances: InstanceView[];
  system: SystemInfo;
  defaultRamMb: number;
  account: AccountView | null;
  onOpenSkinSettings: () => void;
  onRefresh: () => Promise<void>;
  /** Показывать большой 3D-скин на странице сборок (скрыт в пиксельном пресете 2.4). */
  showHero?: boolean;
}

interface CreateForm {
  name: string;
  mc_version: string;
  loader: Loader;
  loader_version: string;
  icon: string;
  ram_mb: number;
}

interface EditForm {
  name: string;
  ram_mb: number;
  jvm_args: string;
  java_path: string;
  icon: string;
  quick_play_mode: string;
  quick_play_target: string;
  game_language: string;
}

interface Notice {
  title: string;
  message: string;
  path?: string;
}

export default function InstancesTab({ instances, system, defaultRamMb, account, onOpenSkinSettings, onRefresh, showHero = true }: Props) {
  const { addNotification } = useNotifications();
  const { t } = useUi();
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: "",
    mc_version: "1.20.1",
    loader: "fabric",
    loader_version: "",
    icon: "🎮",
    ram_mb: 4096,
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [nameError, setNameError] = useState("");
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [mcVersions, setMcVersions] = useState<string[]>(MC_VERSION_FALLBACK);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InstanceView | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    ram_mb: 4096,
    jvm_args: "",
    java_path: "",
    icon: "🎮",
    quick_play_mode: "off",
    quick_play_target: "",
    game_language: "ru_ru",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstanceView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [crash, setCrash] = useState<CrashReport | null>(null);
  const [fpsResult, setFpsResult] = useState<UltraFpsResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [importing, setImporting] = useState(false);

  const isBusy = (name: string, action: string) => Boolean(busy[`${name}:${action}`]);

  const runAction = async (name: string, action: string, fn: () => Promise<void>) => {
    const key = `${name}:${action}`;
    if (busy[key]) return;
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  useEffect(() => {
    let alive = true;
    const unlisten = listen<GameExit>("game-exit", (event) => {
      if (!alive) return;
      const result = event.payload;
      if (result.ok) {
        addNotification({
          type: "success",
          message: t("inst.finishedOk", {
            name: result.instance,
            min: Math.max(1, Math.round(result.seconds / 60)),
          }),
        });
      } else if (result.report) {
        setCrash(result.report);
        addNotification({ type: "error", message: t("inst.crashed", { title: result.report.title }) });
      } else {
        addNotification({
          type: "error",
          message: t("inst.exitCode", { name: result.instance, code: result.code ?? "?" }),
        });
      }
      void onRefresh();
    });
    return () => {
      alive = false;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [addNotification, onRefresh, t]);

  useEffect(() => {
    let alive = true;
    api
      .minecraftVersions()
      .then((list) => {
        if (!alive || !list || list.length === 0) return;
        setMcVersions((prev) => {
          const merged = [...list];
          for (const version of prev) {
            if (!merged.includes(version)) merged.push(version);
          }
          return merged;
        });
      })
      .catch(() => {
        // остаётся резервный список популярных релизов
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    const maxRam = Math.max(2048, Math.min(32768, system.total_ram_mb - 1024));
    setNameTouched(false);
    setNameError("");
    setCreateForm({
      name: defaultInstanceName("fabric", "1.20.1"),
      mc_version: "1.20.1",
      loader: "fabric",
      loader_version: "",
      icon: "🎮",
      ram_mb: Math.min(Math.max(1024, defaultRamMb || 4096), maxRam),
    });
    setLoaderVersions([]);
  }, [showCreate, system.total_ram_mb, defaultRamMb]);

  // Автоимя «<Загрузчик> <Версия>» обновляется, пока пользователь не изменил поле вручную.
  useEffect(() => {
    if (!showCreate || nameTouched) return;
    setCreateForm((prev) => ({
      ...prev,
      name: defaultInstanceName(prev.loader, prev.mc_version),
    }));
  }, [showCreate, nameTouched, createForm.loader, createForm.mc_version]);

  useEffect(() => {
    if (!showCreate || createForm.loader === "vanilla") {
      setLoaderVersions([]);
      setLoadingVersions(false);
      return;
    }
    let alive = true;
    setLoadingVersions(true);
    api
      .loaderVersions(createForm.mc_version.trim(), createForm.loader)
      .then((versions) => {
        if (!alive) return;
        setLoaderVersions(versions);
        setCreateForm((prev) => ({ ...prev, loader_version: versions[0] ?? "" }));
      })
      .catch(() => {
        if (alive) setLoaderVersions([]);
      })
      .finally(() => {
        if (alive) setLoadingVersions(false);
      });
    return () => {
      alive = false;
    };
  }, [showCreate, createForm.loader, createForm.mc_version]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instances;
    return instances.filter((instance) =>
      [instance.name, instance.mc_version, instance.loader, LOADER_NAMES[instance.loader] ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [instances, query]);

  const installedCount = instances.filter((instance) => instance.version_ready).length;
  const modsCount = instances.reduce((sum, instance) => sum + instance.mods_count, 0);
  const totalHours = instances.reduce((sum, instance) => sum + instance.playtime_hours, 0);

  const create = async () => {
    const name = createForm.name.trim();
    if (!name) {
      setNameError(t("inst.nameRequired"));
      return;
    }
    if (/[\\/:*?"<>|]/.test(name)) {
      setNameError(t("inst.nameInvalid"));
      return;
    }
    setNameError("");
    setCreating(true);
    try {
      await api.createInstance({
        name,
        mc_version: createForm.mc_version.trim(),
        loader: createForm.loader,
        loader_version: createForm.loader === "vanilla" ? null : createForm.loader_version || null,
        icon: createForm.icon,
        ram_mb: createForm.ram_mb,
      });
      setShowCreate(false);
      await onRefresh();
      addNotification({
        type: "success",
        message: t("inst.created", { name }),
      });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (instance: InstanceView) => {
    setEditing(instance);
    setEditForm({
      name: instance.name,
      ram_mb: instance.ram_mb,
      jvm_args: instance.jvm_args.join("\n"),
      java_path: instance.java_path || "",
      icon: instance.icon || "🎮",
      quick_play_mode: instance.quick_play_mode || "off",
      quick_play_target: instance.quick_play_target || "",
      game_language: instance.game_language || "ru_ru",
    });
    setMenuFor(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editForm.name.trim();
    if (!name) {
      addNotification({ type: "warning", message: t("inst.nameEmpty") });
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateInstance(editing.name, {
        name,
        ram_mb: editForm.ram_mb,
        jvm_args: editForm.jvm_args
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        java_path: editForm.java_path.trim(),
        icon: editForm.icon,
        quick_play_mode: editForm.quick_play_mode,
        quick_play_target: editForm.quick_play_target.trim(),
        game_language: editForm.game_language,
      });
      setEditing(null);
      await onRefresh();
      addNotification({ type: "success", message: t("inst.saved") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setSavingEdit(false);
    }
  };

  const launch = (instance: InstanceView) => {
    if (!instance.version_ready) {
      void install(instance);
      return;
    }
    void runAction(instance.name, "launch", async () => {
      const info = await api.launchInstance(instance.name);
      addNotification({
        type: "success",
        message: t("launch.launched", { name: info.instance, args: info.arg_count }),
      });
    });
  };

  const install = (instance: InstanceView) =>
    runAction(instance.name, "install", async () => {
      await api.installInstance(instance.name);
      addNotification({ type: "info", message: t("launch.installing", { name: instance.name }) });
      await onRefresh();
    });

  const backup = (instance: InstanceView) =>
    runAction(instance.name, "backup", async () => {
      const path = await api.backupInstance(instance.name);
      setNotice({
        title: t("inst.backupTitle"),
        message: t("inst.backupText"),
        path,
      });
    });

  const exportInstance = (instance: InstanceView) =>
    runAction(instance.name, "export", async () => {
      const dest = await api.pickSavePath(`${instance.name}.zip`);
      if (!dest) return;
      const path = await api.exportInstance(instance.name, dest);
      setNotice({ title: t("inst.exportTitle"), message: t("inst.exportText"), path });
    });

  const ultraFps = (instance: InstanceView) =>
    runAction(instance.name, "fps", async () => {
      const result = await api.ultraFps(instance.name);
      setFpsResult(result);
      await onRefresh();
    });

  const analyze = (instance: InstanceView) =>
    runAction(instance.name, "crash", async () => {
      const report = await api.analyzeCrash(instance.name, null);
      setCrash(report);
    });

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteInstance(deleteTarget.name);
      addNotification({ type: "success", message: t("inst.deleted", { name: deleteTarget.name }) });
      setDeleteTarget(null);
      await onRefresh();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setDeleting(false);
    }
  };

  const importModpack = async () => {
    setImporting(true);
    try {
      const path = await api.pickFile("modpack");
      if (!path) return;
      const result = await api.importModpack(path, null, null, null, null);
      await onRefresh();
      addNotification({
        type: "success",
        message: t("inst.imported", {
          name: result.instance.name,
          files: result.installed_files,
        }),
      });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setImporting(false);
    }
  };

  const crashText = async () => {
    if (!crash) return;
    try {
      const text = await api.crashText(crash);
      const copied = await copyText(text);
      addNotification({
        type: copied ? "success" : "error",
        message: copied ? t("inst.reportCopied") : t("inst.reportCopyFailed"),
      });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title={t("inst.title")}
        subtitle={t("inst.subtitle")}
        actions={
          <>
            <Button variant="outline" icon="upload" onClick={() => void importModpack()} loading={importing}>
              {t("inst.importMrpack")}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
              {t("inst.create")}
            </Button>
          </>
        }
      />

      <div className={cn("mb-5 grid gap-4", showHero ? "xl:grid-cols-[minmax(0,1fr)_316px]" : "xl:grid-cols-1")}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="glass relative flex flex-1 flex-col justify-center gap-3 overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-[var(--accent-soft)] blur-3xl" />
            <div className="relative">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] muted">Mibl Launcher 2.4</div>
              <h2 className="mt-1 text-[21px] font-semibold leading-tight text-[var(--fg)]">
                {account ? (
                  <>
                    {t("inst.welcomePrefix")}{" "}
                    <span className="text-[var(--accent)]">{account.name}</span>!
                  </>
                ) : (
                  t("inst.welcome")
                )}
              </h2>
              <p className="mt-1.5 max-w-[560px] text-[11.5px] leading-relaxed muted">
                {account ? t("inst.heroAccount") : t("inst.heroGuest")}
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-1.5">
              <Badge tone={account?.type === "ely" ? "accent" : "neutral"}>
                <Icon name="users" size={11} />
                {account
                  ? account.type === "ely"
                    ? t("kind.ely")
                    : t("kind.offline")
                  : t("inst.noAccount")}
              </Badge>
              <span className="rounded-full border border-white/10 bg-black/15 px-2 py-[3px] text-[10.5px] font-semibold text-[var(--fg)]/75">
                {t("inst.count", { n: instances.length })}
              </span>
              <span className="rounded-full border border-white/10 bg-black/15 px-2 py-[3px] text-[10.5px] font-semibold text-[var(--fg)]/75">
                {t("inst.ready", { n: installedCount })}
              </span>
              <span className="rounded-full border border-white/10 bg-black/15 px-2 py-[3px] text-[10.5px] font-semibold text-[var(--fg)]/75">
                {t("inst.hours", { n: totalHours.toFixed(1) })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon="cube" label={t("inst.statInstances")} value={String(instances.length)} hint={t("inst.ready", { n: installedCount })} />
            <StatCard icon="layers" label={t("inst.statMods")} value={String(modsCount)} hint={t("inst.statHintLocal")} />
            <StatCard icon="clock" label={t("inst.statPlaytime")} value={t("inst.hours", { n: totalHours.toFixed(1) })} hint={t("inst.statHintAll")} />
            <StatCard
              icon="server"
              label={t("inst.statRam")}
              value={t("settings.gb", { n: Math.round(system.total_ram_mb / 1024) })}
              hint={system.java_hint ? t("inst.javaFound") : t("inst.javaMissing")}
            />
          </div>
        </div>

        {showHero && (
          <Suspense fallback={<div className="glass min-h-[388px] animate-pulse" />}>
            <HeroSkinViewer
              account={account}
              onOpenSkinSettings={onOpenSkinSettings}
              className="min-h-[388px]"
            />
          </Suspense>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-[340px]">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("inst.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {t("inst.autoRefresh")}
        </div>
      </div>

      {instances.length === 0 ? (
        <EmptyState
          icon="cube"
          title={t("inst.emptyTitle")}
          text={t("inst.emptyText")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
                {t("inst.create")}
              </Button>
              <Button variant="outline" icon="upload" onClick={() => void importModpack()}>
                {t("inst.import")}
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("content.nothingFound")}
          text={t("inst.notFoundText")}
        />
      ) : (
        <div className="card-grid">
          {filtered.map((instance) => {
            const loaderName = LOADER_NAMES[instance.loader] ?? instance.loader ?? "Vanilla";
            const launching = isBusy(instance.name, "launch");
            const installing = isBusy(instance.name, "install");
            return (
              <GlassCard key={instance.name} hover className="group flex flex-col transition-transform duration-200 hover:-translate-y-0.5">
                <div className="cover-art relative h-[132px] p-4" style={{ background: coverGradient(instance.name) }}>
                  <div className="flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-black/20 text-[28px] shadow-lg backdrop-blur-sm">
                      {instance.icon_url ? (
                        <img
                          src={instance.icon_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        instance.icon || "▣"
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {instance.version_ready ? (
                        <Badge tone="success">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {t("inst.badgeReady")}
                        </Badge>
                      ) : (
                        <Badge tone="warn">{t("inst.badgeInstalling")}</Badge>
                      )}
                      {instance.ultra_fps_at > 0 && <Badge tone="accent">Ultra FPS</Badge>}
                    </div>
                  </div>
                  <div className="absolute inset-x-4 bottom-3">
                    <h3 className="truncate text-[17px] font-semibold text-white text-shadow">{instance.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] font-medium text-white/75">
                      <span className="rounded-md bg-black/25 px-1.5 py-[2px]">{instance.mc_version}</span>
                      <span className="rounded-md bg-black/25 px-1.5 py-[2px]">{loaderName}</span>
                      {instance.loader_version && (
                        <span className="truncate rounded-md bg-black/25 px-1.5 py-[2px]">{instance.loader_version}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniStat label={t("inst.miniMods")} value={String(instance.mods_count)} />
                    <MiniStat label={t("inst.miniPlaytime")} value={formatPlaytime(instance.playtime_hours, instance.playtime_seconds)} />
                    <MiniStat label={t("inst.miniLaunch")} value={formatRelative(instance.last_played)} />
                  </div>

                  <div className="mt-auto flex items-center gap-1.5">
                    <Button
                      variant="primary"
                      icon={instance.version_ready ? "play" : "download"}
                      className="flex-1"
                      loading={launching || installing}
                      disabled={launching || installing}
                      onClick={() => launch(instance)}
                    >
                      {instance.version_ready ? t("launch.play") : t("launch.install")}
                    </Button>
                    <IconButton
                      icon="download"
                      label={t("inst.reinstall")}
                      disabled={installing || launching}
                      onClick={() => void install(instance)}
                    />
                    <IconButton icon="settings" label={t("inst.settings")} onClick={() => openEdit(instance)} />
                    <div className="relative">
                      <IconButton
                        icon="dots"
                        label={t("inst.more")}
                        variant={menuFor === instance.name ? "soft" : "ghost"}
                        onClick={() => setMenuFor((prev) => (prev === instance.name ? null : instance.name))}
                      />
                      {menuFor === instance.name && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                          <div className="glass-strong absolute bottom-full right-0 z-40 mb-1 w-[216px] overflow-hidden p-1">
                            <MenuItem icon="edit" label={t("inst.menuEdit")} onClick={() => openEdit(instance)} />
                            <MenuItem
                              icon="archive"
                              label={t("inst.menuBackup")}
                              busy={isBusy(instance.name, "backup")}
                              onClick={() => {
                                setMenuFor(null);
                                void backup(instance);
                              }}
                            />
                            <MenuItem
                              icon="save"
                              label={t("inst.menuExport")}
                              busy={isBusy(instance.name, "export")}
                              onClick={() => {
                                setMenuFor(null);
                                void exportInstance(instance);
                              }}
                            />
                            <MenuItem
                              icon="bolt"
                              label={t("inst.menuUltraFps")}
                              busy={isBusy(instance.name, "fps")}
                              onClick={() => {
                                setMenuFor(null);
                                void ultraFps(instance);
                              }}
                            />
                            <MenuItem
                              icon="terminal"
                              label={t("inst.menuCrash")}
                              busy={isBusy(instance.name, "crash")}
                              onClick={() => {
                                setMenuFor(null);
                                void analyze(instance);
                              }}
                            />
                            <div className="my-1 h-px bg-white/10" />
                            <MenuItem
                              icon="trash"
                              label={t("inst.menuDelete")}
                              danger
                              onClick={() => {
                                setMenuFor(null);
                                setDeleteTarget(instance);
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Новая сборка */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("inst.createTitle")}
        subtitle={t("inst.createSubtitle")}
        width={620}
        panelClassName="modal-create max-w-2xl w-full border-2 border-white/20 shadow-2xl"
        bodyClassName="p-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => void create()} loading={creating}>
              {t("inst.createAndInstall")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("inst.nameLabel")} hint={t("inst.nameHint")} className="sm:col-span-2">
            {nameError && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-[11.5px] font-medium leading-snug text-red-200">
                <Icon name="alert" size={14} className="mt-[1px] shrink-0" />
                <span>{nameError}</span>
              </div>
            )}
            <TextInput
              value={createForm.name}
              onChange={(event) => {
                setNameTouched(true);
                setNameError("");
                setCreateForm((prev) => ({ ...prev, name: event.target.value }));
              }}
              placeholder={t("inst.namePlaceholder")}
              className={cn(
                "!h-11 !border-2 !bg-[#0B0C10] px-4 py-3 !text-white",
                nameError ? "!border-red-500" : "!border-white/30 focus:!border-[#5865F2]",
              )}
              autoFocus
            />
          </Field>

          <Field label={t("inst.mcVersionLabel")} hint={t("inst.mcVersionHint")}>
            <CustomSelect
              searchable
              value={createForm.mc_version}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, mc_version: event.target.value }))}
            >
              {(mcVersions.includes(createForm.mc_version)
                ? mcVersions
                : [createForm.mc_version, ...mcVersions]
              ).map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </CustomSelect>
          </Field>

          <Field label={t("inst.loaderLabel")}>
            <CustomSelect
              value={createForm.loader}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, loader: event.target.value as Loader, loader_version: "" }))
              }
            >
              {LOADERS.map((loader) => (
                <option key={loader.key} value={loader.key}>
                  {loader.name}
                </option>
              ))}
            </CustomSelect>
          </Field>

          {createForm.loader !== "vanilla" && (
            <Field
              label={t("inst.loaderVersionLabel")}
              hint={loadingVersions ? t("inst.loaderVersionLoading") : t("inst.loaderVersionHint")}
              className="sm:col-span-2"
            >
              <CustomSelect
                value={createForm.loader_version}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, loader_version: event.target.value }))}
                disabled={loadingVersions || loaderVersions.length === 0}
              >
                {loaderVersions.length === 0 ? (
                  <option value="">{loadingVersions ? t("inst.loading") : t("inst.auto")}</option>
                ) : (
                  loaderVersions.map((version) => (
                    <option key={version} value={version}>
                      {version}
                    </option>
                  ))
                )}
              </CustomSelect>
            </Field>
          )}

          <Field label={t("inst.iconLabel")} className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setCreateForm((prev) => ({ ...prev, icon }))}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[18px] transition ${
                    createForm.icon === icon
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                      : "border-white/10 bg-black/15 hover:bg-white/8"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("inst.ramLabel", { mb: createForm.ram_mb })} className="sm:col-span-2">
            <Slider
              value={createForm.ram_mb}
              min={1024}
              max={Math.max(2048, Math.min(32768, system.total_ram_mb - 1024))}
              step={512}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, ram_mb: value }))}
              leftLabel={t("settings.gb", { n: 1 })}
              rightLabel={t("settings.gb", {
                n: Math.round(Math.max(2048, Math.min(32768, system.total_ram_mb - 1024)) / 1024),
              })}
            />
          </Field>
        </div>
      </Modal>

      {/* Настройки сборки */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? t("inst.editTitle", { name: editing.name }) : t("inst.editFallback")}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={savingEdit}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" icon="save" onClick={() => void saveEdit()} loading={savingEdit}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("inst.nameField")}>
            <TextInput
              value={editForm.name}
              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>
          <Field label={t("inst.iconLabel")}>
            <CustomSelect value={editForm.icon} onChange={(event) => setEditForm((prev) => ({ ...prev, icon: event.target.value }))}>
              {ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </CustomSelect>
          </Field>

          <Field label={t("inst.ramLabel", { mb: editForm.ram_mb })} className="sm:col-span-2">
            <Slider
              value={editForm.ram_mb}
              min={1024}
              max={Math.max(2048, Math.min(32768, system.total_ram_mb - 1024))}
              step={512}
              onChange={(value) => setEditForm((prev) => ({ ...prev, ram_mb: value }))}
              leftLabel={t("settings.gb", { n: 1 })}
              rightLabel={t("inst.ramMaxSystem")}
            />
          </Field>

          <Field
            label={t("inst.javaPathLabel")}
            hint={t("inst.javaPathHint")}
            className="sm:col-span-2"
          >
            <TextInput
              value={editForm.java_path}
              onChange={(event) => setEditForm((prev) => ({ ...prev, java_path: event.target.value }))}
              placeholder={t("inst.javaPathPlaceholder")}
            />
          </Field>

          <Field label={t("inst.quickPlayLabel")} hint={t("inst.quickPlayHint")}>
            <CustomSelect
              value={editForm.quick_play_mode}
              onChange={(event) => setEditForm((prev) => ({ ...prev, quick_play_mode: event.target.value }))}
            >
              <option value="off">{t("inst.quickPlayOff")}</option>
              <option value="singleplayer">{t("inst.quickPlaySingle")}</option>
              <option value="multiplayer">{t("inst.quickPlayMulti")}</option>
            </CustomSelect>
          </Field>
          <Field label={t("inst.quickPlayTarget")} hint={t("inst.quickPlayTargetHint")}>
            <TextInput
              value={editForm.quick_play_target}
              onChange={(event) => setEditForm((prev) => ({ ...prev, quick_play_target: event.target.value }))}
              placeholder="play.example.com"
              disabled={editForm.quick_play_mode === "off"}
            />
          </Field>

          <Field
            label={t("inst.gameLanguageLabel")}
            hint={t("inst.gameLanguageHint")}
            className="sm:col-span-2"
          >
            <CustomSelect
              value={editForm.game_language}
              onChange={(event) => setEditForm((prev) => ({ ...prev, game_language: event.target.value }))}
            >
              {UI_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </CustomSelect>
          </Field>

          <Field label={t("inst.jvmLabel")} hint={t("inst.jvmHint")} className="sm:col-span-2">
            <TextArea
              value={editForm.jvm_args}
              onChange={(event) => setEditForm((prev) => ({ ...prev, jvm_args: event.target.value }))}
              placeholder={"-XX:+UseG1GC\n-XX:MaxGCPauseMillis=200"}
              className="min-h-[120px] font-mono text-[11px]"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("inst.deleteTitle")}
        text={
          deleteTarget
            ? t("inst.deleteText", { name: deleteTarget.name })
            : ""
        }
        confirmLabel={t("inst.deleteConfirm")}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />

      {/* Отчёт о краше */}
      <Modal
        open={Boolean(crash)}
        onClose={() => setCrash(null)}
        title={crash?.title ?? t("inst.crashTitle")}
        subtitle={crash?.intro}
        width={800}
        footer={
          <>
            <Button variant="outline" icon="copy" onClick={() => void crashText()}>
              {t("inst.copyReport")}
            </Button>
            <Button variant="soft" onClick={() => setCrash(null)}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        {crash && (
          <div className="space-y-4">
            {crash.causes.length > 0 && (
              <div className="space-y-2">
                {crash.causes.map((cause, index) => (
                  <div key={index} className="rounded-xl border border-rose-400/20 bg-rose-500/8 p-3">
                    <div className="text-[12px] font-semibold text-rose-200">{cause.title}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-[var(--fg)]/75">{cause.detail}</div>
                  </div>
                ))}
              </div>
            )}
            {crash.log_path && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 font-mono text-[10.5px] text-[var(--muted)]">
                {crash.log_path}
              </div>
            )}
            <pre className="max-h-[320px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[10.5px] leading-relaxed text-[var(--fg)]/75">
              {crash.tail || t("inst.logEmpty")}
            </pre>
          </div>
        )}
      </Modal>

      {/* Результат Ultra FPS */}
      <Modal
        open={Boolean(fpsResult)}
        onClose={() => setFpsResult(null)}
        title={t("inst.fpsTitle")}
        subtitle={t("inst.fpsSubtitle")}
        width={640}
        footer={
          <Button variant="soft" onClick={() => setFpsResult(null)}>
            {t("inst.fpsOk")}
          </Button>
        }
      >
        {fpsResult && (
          <div className="space-y-4 text-[12px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="text-[10px] uppercase tracking-wider muted">{t("inst.fpsRam")}</div>
                <div className="mt-1 text-[18px] font-semibold">
                  {t("inst.mb", { n: formatNumber(fpsResult.ram_mb) })}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="text-[10px] uppercase tracking-wider muted">{t("inst.fpsGc")}</div>
                <div className="mt-1 text-[18px] font-semibold">{fpsResult.gc}</div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold">{t("inst.fpsMods")}</div>
              <div className="flex flex-wrap gap-1.5">
                {fpsResult.mods.length === 0 ? (
                  <span className="text-[11px] muted">{t("inst.fpsNoNew")}</span>
                ) : (
                  fpsResult.mods.map((mod) => (
                    <Badge key={mod} tone="success">
                      {mod}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            {fpsResult.failed.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-amber-200">{t("inst.fpsFailed")}</div>
                <ul className="space-y-1 text-[11px] text-amber-100/80">
                  {fpsResult.failed.map((fail) => (
                    <li key={fail}>• {fail}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold">{t("inst.fpsArgs")}</div>
              <pre className="max-h-[160px] overflow-auto rounded-lg border border-white/10 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
                {fpsResult.jvm_args.join("\n")}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Уведомление о пути */}
      <Modal
        open={Boolean(notice)}
        onClose={() => setNotice(null)}
        title={notice?.title ?? ""}
        width={520}
        footer={
          <>
            {notice?.path && (
              <Button
                variant="outline"
                icon="copy"
                onClick={async () => {
                  const copied = await copyText(notice.path ?? "");
                  addNotification({
                    type: copied ? "success" : "error",
                    message: copied ? t("settings.pathCopied") : t("settings.pathCopyFailed"),
                  });
                }}
              >
                {t("settings.copyPath")}
              </Button>
            )}
            <Button variant="soft" onClick={() => setNotice(null)}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--fg)]/80">{notice?.message}</p>
        {notice?.path && (
          <div className="mt-3 break-all rounded-lg border border-white/10 bg-black/25 p-2.5 font-mono text-[10.5px] text-[var(--muted)]">
            {notice.path}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: "cube" | "layers" | "clock" | "server";
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="glass flex items-center gap-3 px-3.5 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon name={icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider muted">{label}</div>
        <div className="truncate text-[16px] font-semibold leading-tight text-[var(--fg)]">{value}</div>
        <div className="truncate text-[10px] muted">{hint}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/8 bg-black/15 px-1.5 py-1.5">
      <div className="truncate text-[11px] font-semibold text-[var(--fg)]/90">{value}</div>
      <div className="text-[9px] uppercase tracking-wide muted">{label}</div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
  busy = false,
}: {
  icon: "edit" | "archive" | "save" | "bolt" | "terminal" | "trash";
  label: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
        danger ? "text-rose-200 hover:bg-rose-500/15" : "text-[var(--fg)]/80 hover:bg-white/8 hover:text-[var(--fg)]"
      }`}
    >
      {busy ? <Spinner size={12} /> : <Icon name={icon} size={13} />}
      {label}
    </button>
  );
}
