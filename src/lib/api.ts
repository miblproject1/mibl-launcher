import { invoke } from "@tauri-apps/api/core";
import { detectLanguage, translate, type TranslationKey } from "../i18n/translations";

function tt(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(detectLanguage(), key, vars);
}

export type Loader = "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";
export type PageKey = "home" | "instances" | "content" | "modpacks" | "theme" | "settings";
export type ContentKind = "mod" | "resourcepack" | "shader";
export type PickKind =
  | "skin"
  | "modpack"
  | "archive"
  | "image"
  | "video"
  | "java"
  | "audio"
  | "font";

export const LOADERS: Array<{ key: Loader; name: string }> = [
  { key: "vanilla", name: "Vanilla" },
  { key: "fabric", name: "Fabric" },
  { key: "quilt", name: "Quilt" },
  { key: "forge", name: "Forge" },
  { key: "neoforge", name: "NeoForge" },
];

export interface Config {
  username: string;
  ram_mb: number;
  java_path: string;
  last_version: string;
  last_page: string;
  theme: string;
  last_instance: string;
  default_ram_mb: number;
  /** Язык игры по умолчанию (пишется в options.txt перед запуском). */
  game_language: string;
  /** Сворачивать лаунчер при старте игры. */
  auto_minimize: boolean;
  /** Дополнительные глобальные JVM-аргументы. */
  jvm_args: string[];
  /** Автоматический бэкап миров после закрытия игры. */
  auto_backup_worlds: boolean;
  /** Сколько архивов на мир хранить. */
  world_backup_keep: number;
  /** Личный API-ключ CurseForge для каталога модов и сборок. */
  curseforge_api_key: string;
  /** Оптимизация FPS (ограничение кадров, отключено по умолчанию). */
  optimize_fps: boolean;
}

export interface Theme {
  preset: string;
  accent: string;
  bg: string;
  panel: string;
  panel2: string;
  fg: string;
  muted: string;
  glass: number;
  radius: number;
  font: string;
  bg_image: string;
  bg_dim: number;
  bg_blur: number;
  audio: string;
  volume: number;
  bg_video: string;
  bg_video_muted: boolean;
}

export interface ThemePreset {
  key: string;
  name: string;
  accent: string;
  bg: string;
  panel: string;
  panel2: string;
  fg: string;
  muted: string;
}

export interface Account {
  name: string;
  type: string;
  skin: string | null;
  ely: string | null;
  uuid?: string | null;
  access_token?: string | null;
  client_token?: string | null;
  ely_username?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  xuid?: string | null;
}

export interface MicrosoftDeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export interface MicrosoftPoll {
  status: "pending" | "slow_down" | "ok";
  message: string | null;
  accounts: AccountView[] | null;
  selected: number | null;
}

export interface AccountView extends Account {
  active: boolean;
  has_skin: boolean;
  skin_data_url: string | null;
}

export interface Instance {
  name: string;
  mc_version: string;
  loader: Loader | string;
  loader_version: string | null;
  version_id: string | null;
  icon: string;
  icon_url?: string | null;
  ram_mb: number;
  jvm_args: string[];
  java_path: string;
  created: number;
  last_played: number;
  installed: boolean;
  playtime_seconds: number;
  quick_play_mode: string;
  quick_play_target: string;
  ultra_fps_at: number;
  /** Язык Minecraft, записываемый в options.txt перед запуском. */
  game_language: string;
  /** Автобэкап миров этой сборки после закрытия игры. */
  auto_backup: boolean;
  /** Откуда сборка импортирована (пусто — создана в лаунчере). */
  import_source: string;
}

export interface InstanceView extends Instance {
  playtime_hours: number;
  version_ready: boolean;
  mods_count: number;
}

export interface TaskInfo {
  id: string;
  title: string;
  kind: string;
  done: number;
  total: number;
  speed: number;
  state: "running" | "done" | "error";
  detail: string;
}

export interface ContentFile {
  file: string;
  path: string;
  enabled: boolean;
  size: number;
}

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
}

export interface ModrinthSearch {
  hits: ModrinthHit[];
  total_hits: number;
  offset: number;
}

export type ModpackSource = "all" | "modrinth" | "curseforge";

export interface ModpackHit {
  id: string;
  source: "modrinth" | "curseforge";
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
  loaders: string[];
  available: boolean;
}

export interface ModpackSearch {
  hits: ModpackHit[];
  total_hits: number;
  offset: number;
  /** Понятная подсказка, если один из источников временно недоступен. */
  notice?: string | null;
}

export const MC_VERSIONS = [
  "1.21.4",
  "1.21.1",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.16.5",
  "1.12.2",
  "1.8.9",
  "1.7.10",
];

/** Резервный список релизов, если манифест Mojang недоступен. */
export const MC_VERSION_FALLBACK = [
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.17.1",
  "1.16.5",
  "1.16.4",
  "1.15.2",
  "1.14.4",
  "1.13.2",
  "1.12.2",
  "1.11.2",
  "1.10.2",
  "1.9.4",
  "1.8.9",
  "1.7.10",
];

export interface CrashCause {
  title: string;
  detail: string;
}

export interface CrashReport {
  title: string;
  intro: string;
  causes: CrashCause[];
  log_path: string | null;
  tail: string;
  exit_code: number | null;
}

export interface SystemInfo {
  total_ram_mb: number;
  data_dir: string;
  instances: number;
  java_hint: string | null;
}

export interface Bootstrap {
  config: Config;
  theme: Theme;
  presets: ThemePreset[];
  accounts: AccountView[];
  selected: number;
  instances: InstanceView[];
  system: SystemInfo;
}

export interface LaunchInfo {
  instance: string;
  java: string;
  arg_count: number;
  command_preview: string;
}

export interface GameExit {
  instance: string;
  code: number | null;
  seconds: number;
  ok: boolean;
  report: CrashReport | null;
  /** Последние строки stdout/stderr Java, если игра упала до создания лога. */
  output?: string[];
}

export interface UltraFpsResult {
  ram_mb: number;
  gc: string;
  mods: string[];
  jvm_args: string[];
  failed: string[];
}

export interface JvmPlan {
  ram_mb: number;
  jvm_args: string[];
  gc: string;
  total_ram_mb: number;
}

export interface ImportResult {
  instance: Instance;
  installed_files: number;
  skipped: string[];
}

/* --------------------------------------------------- бэкапы миров 2.6.0 */
export interface WorldBackup {
  path: string;
  file_name: string;
  world: string;
  stamp: string;
  created: number;
  size: number;
  automatic: boolean;
  legacy: boolean;
}

export interface RestoreResult {
  world: string;
  files: number;
  previous_saved: string | null;
  skipped: string[];
}

/* ------------------------------------------- импорт из других лаунчеров */
export interface LauncherInfo {
  source: string;
  name: string;
  path: string;
  instances: number;
}

export interface FoundInstance {
  id: string;
  source: string;
  launcher: string;
  name: string;
  path: string;
  mc_version: string;
  loader: string;
  loader_version: string | null;
  icon: string | null;
  mods: number;
  worlds: number;
  size_bytes: number;
  already_imported: boolean;
}

export interface LauncherScan {
  launchers: LauncherInfo[];
  instances: FoundInstance[];
  warnings: string[];
}

export interface ImportItem {
  path: string;
  source: string;
  name?: string | null;
  mc_version?: string | null;
  loader?: string | null;
  loader_version?: string | null;
}

export interface ImportSummary {
  imported: ImportResult[];
  skipped: number;
  errors: string[];
}

export const api = {
  bootstrap: () => invoke<Bootstrap>("bootstrap"),
  tasks: () => invoke<TaskInfo[]>("tasks_snapshot"),
  clearTasks: () => invoke<void>("tasks_clear"),

  saveConfig: (config: Config) => invoke<Config>("save_config", { config }),
  saveTheme: (theme: Theme) => invoke<Theme>("save_theme", { theme }),
  applyPreset: (key: string) => invoke<Theme>("apply_theme_preset", { key }),
  resetTheme: () => invoke<Theme>("reset_theme"),
  systemInfo: () => invoke<SystemInfo>("system_info_cmd"),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openInstanceFolder: (name: string) => invoke<void>("open_instance_folder", { name }),

  pickFile: (kind: PickKind) => invoke<string | null>("pick_file", { kind }),
  pickSavePath: (defaultName: string) =>
    invoke<string | null>("pick_save_path", { defaultName }),

  listInstances: () => invoke<InstanceView[]>("list_instances"),
  createInstance: (payload: {
    name: string;
    mc_version: string;
    loader: string;
    loader_version?: string | null;
    icon?: string;
    ram_mb?: number;
  }) => invoke<Instance>("create_instance", { payload }),
  installInstance: (name: string) => invoke<void>("install_instance", { name }),
  updateInstance: (
    name: string,
    patch: {
      name?: string;
      ram_mb?: number;
      jvm_args?: string[];
      java_path?: string;
      icon?: string;
      quick_play_mode?: string;
      quick_play_target?: string;
      game_language?: string;
      auto_backup?: boolean;
    },
  ) => invoke<Instance>("update_instance", { name, patch }),
  deleteInstance: (name: string) => invoke<void>("delete_instance", { name }),
  loaderVersions: (mcVersion: string, loader: string) =>
    invoke<string[]>("loader_versions", { mcVersion, loader }),
  launchInstance: (name: string) => invoke<LaunchInfo>("launch_instance", { name }),
  defaultJvm: (ramMb?: number) =>
    invoke<JvmPlan>("default_jvm", { ramMb: ramMb ?? null }),

  listContent: (instance: string, kind: ContentKind) =>
    invoke<ContentFile[]>("list_content", { instance, kind }),
  toggleContent: (path: string) => invoke<string>("toggle_content", { path }),
  deleteContent: (path: string) => invoke<void>("delete_content", { path }),

  modrinthSearch: (
    query: string,
    kind: ContentKind,
    loader: string | null,
    mcVersion: string | null,
    offset = 0,
    limit = 20,
  ) =>
    invoke<ModrinthSearch>("modrinth_search", {
      query,
      kind,
      loader,
      mcVersion,
      offset,
      limit,
    }),
  modrinthInstall: (projectId: string, kind: ContentKind, instance: string) =>
    invoke<string[]>("modrinth_install", { projectId, kind, instance }),

  contentSearch: (
    query: string,
    kind: ContentKind,
    source: ModpackSource,
    loader: string | null,
    mcVersion: string | null,
    offset = 0,
    limit = 20,
  ) =>
    invoke<ModpackSearch>("content_search", {
      query,
      kind,
      source,
      loader,
      mcVersion,
      offset,
      limit,
    }),
  contentInstall: (
    source: "modrinth" | "curseforge",
    projectId: string,
    kind: ContentKind,
    instance: string,
  ) =>
    invoke<string[]>("content_install", { source, projectId, kind, instance }),
  minecraftVersions: () => invoke<string[]>("minecraft_versions"),

  modpackSearch: (
    query: string,
    source: ModpackSource,
    loader: string | null,
    mcVersion: string | null,
    offset = 0,
    limit = 20,
  ) =>
    invoke<ModpackSearch>("modpack_search", {
      query,
      source,
      loader,
      mcVersion,
      offset,
      limit,
    }),
  modpackInstall: (
    source: "modrinth" | "curseforge",
    projectId: string,
    name: string | null,
    iconUrl: string | null,
    mcVersion: string | null,
    loader: string | null,
  ) =>
    invoke<ImportResult>("modpack_install", {
      source,
      projectId,
      name,
      iconUrl,
      mcVersion,
      loader,
    }),
  ultraFps: (instance: string) => invoke<UltraFpsResult>("ultra_fps", { instance }),

  accounts: () => invoke<[AccountView[], number]>("accounts_snapshot_cmd"),
  selectAccount: (index: number) =>
    invoke<[AccountView[], number]>("account_select", { index }),
  removeAccount: (index: number) =>
    invoke<[AccountView[], number]>("account_remove", { index }),
  addOffline: (name: string) =>
    invoke<[AccountView[], number]>("account_add_offline", { name }),
  renameAccount: (index: number, name: string) =>
    invoke<[AccountView[], number]>("account_rename", { index, name }),
  setSkinPath: (index: number, path: string) =>
    invoke<[AccountView[], number]>("account_set_skin_path", { index, path }),
  pickSkin: (index: number) =>
    invoke<[AccountView[], number] | null>("account_pick_skin", { index }),
  skinData: (index: number) =>
    invoke<string | null>("account_skin_data", { index }),
  elyLogin: (username: string, password: string) =>
    invoke<[AccountView[], number]>("ely_login", { username, password }),
  elyNick: (nick: string) =>
    invoke<[AccountView[], number]>("ely_add_nick", { nick }),
  refreshSkin: (index: number) =>
    invoke<[AccountView[], number]>("account_refresh_skin", { index }),
  elyTextures: (nick: string) =>
    invoke<Record<string, unknown> | null>("ely_textures", { nick }),

  microsoftLoginStart: () =>
    invoke<MicrosoftDeviceCode>("microsoft_login_start"),
  microsoftLoginPoll: (deviceCode: string) =>
    invoke<MicrosoftPoll>("microsoft_login_poll", { deviceCode }),
  refreshMicrosoft: (index: number) =>
    invoke<[AccountView[], number]>("microsoft_refresh_account", { index }),

  /* -------------------------------------------------- бэкапы миров 2.6.0 */
  listBackups: (instance: string) => invoke<WorldBackup[]>("list_world_backups", { instance }),
  backupWorlds: (instance: string, auto = false) =>
    invoke<WorldBackup[]>("backup_worlds_now", { instance, auto }),
  restoreBackup: (instance: string, path: string) =>
    invoke<RestoreResult>("restore_world_backup", { instance, path }),
  deleteBackup: (instance: string, path: string) =>
    invoke<void>("delete_world_backup", { instance, path }),
  openBackupsFolder: (instance: string) => invoke<void>("open_backups_folder", { instance }),

  /* ------------------------------------ импорт из других лаунчеров 2.6.0 */
  scanLaunchers: () => invoke<LauncherScan>("scan_other_launchers"),
  inspectFolder: (path: string) => invoke<FoundInstance>("inspect_launcher_folder", { path }),
  importLaunchers: (items: ImportItem[]) =>
    invoke<ImportSummary>("import_other_instances", { items }),
  pickFolder: () => invoke<string | null>("pick_folder"),

  analyzeCrash: (instance: string, exitCode: number | null) =>
    invoke<CrashReport>("analyze_crash", { instance, exitCode }),
  crashText: (report: CrashReport) =>
    invoke<string>("crash_report_text", { report }),

  importModpack: (
    path: string,
    name: string | null,
    mcVersion: string | null,
    loader: string | null,
    loaderVersion: string | null,
  ) =>
    invoke<ImportResult>("import_modpack", {
      path,
      name,
      mcVersion,
      loader,
      loaderVersion,
    }),
  exportInstance: (name: string, dest: string) =>
    invoke<string>("export_instance", { name, dest }),
};

export const LOADER_NAMES: Record<string, string> = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

export function formatPlaytime(hours: number, seconds: number): string {
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return tt("time.hoursMinutes", { h, m });
  }
  const mins = Math.round(seconds / 60);
  if (mins > 0) return tt("time.minutes", { n: mins });
  return tt("time.notPlayed");
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return tt("units.gb", { n: (bytes / 1024 / 1024 / 1024).toFixed(2) });
  if (bytes >= 1024 * 1024) return tt("units.mb", { n: (bytes / 1024 / 1024).toFixed(1) });
  if (bytes >= 1024) return tt("units.kb", { n: Math.round(bytes / 1024) });
  return tt("units.bytes", { n: bytes });
}

/** Метка времени архива: локальная дата и время из unix-секунд. */
export function formatStamp(secs: number): string {
  if (!secs || secs <= 0) return "—";
  try {
    return new Date(secs * 1000).toLocaleString();
  } catch {
    return String(secs);
  }
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return tt("units.million", { n: (n / 1_000_000).toFixed(1) });
  if (n >= 1_000) return tt("units.thousand", { n: (n / 1_000).toFixed(0) });
  return `${n}`;
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
