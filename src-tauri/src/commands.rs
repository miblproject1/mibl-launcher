//! Tauri-команды для UI.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use std::sync::Mutex;

use crate::accounts;
use crate::archive;
use crate::auth;
use crate::backups;
use crate::crash;
use crate::curse;
use crate::ely;
use crate::http;
use crate::instances;
use crate::launcher_import;
use crate::loaders;
use crate::models::{
    Account, AccountView, Config, CrashReport, ImportResult, Instance, InstancePatch, InstanceView,
    LaunchInfo, ModpackHit, ModpackSearch, SystemInfo, Theme, ThemePreset, UltraFpsResult,
};
use crate::modrinth;
use crate::paths;
use crate::store;
use crate::tasks::{self, TaskHandle};
use crate::version;
use std::collections::HashSet;
use std::sync::LazyLock;

/// Global set to track currently running installations by ID to prevent duplicates
static INSTALL_LOCK: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// Сборки, которые сейчас устанавливаются — флаг сбрасывается в конце установки.
static INSTANCE_INSTALLS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Сборки, для которых уже идёт бэкап миров (2.6).
static BACKUP_LOCK: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// Кэш официальных релизов Minecraft из манифеста Mojang.
static MC_VERSIONS_CACHE: LazyLock<Mutex<Option<Vec<String>>>> =
    LazyLock::new(|| Mutex::new(None));

/// Резервный список популярных релизов, если манифест недоступен.
const MC_VERSION_FALLBACK: &[&str] = &[
    "1.21.4", "1.21.3", "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.20",
    "1.19.4", "1.19.3", "1.19.2", "1.19", "1.18.2", "1.18.1", "1.18", "1.17.1", "1.16.5",
    "1.16.4", "1.15.2", "1.14.4", "1.13.2", "1.12.2", "1.11.2", "1.10.2", "1.9.4", "1.8.9",
    "1.7.10",
];

#[derive(Debug, Serialize)]
pub struct Bootstrap {
    pub config: Config,
    pub theme: Theme,
    pub presets: Vec<ThemePreset>,
    pub accounts: Vec<AccountView>,
    pub selected: usize,
    pub instances: Vec<InstanceView>,
    pub system: SystemInfo,
}

#[derive(Debug, Deserialize)]
pub struct NewInstance {
    pub name: String,
    pub mc_version: String,
    #[serde(default)]
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub ram_mb: Option<u32>,
}

fn resolve_skin(path: &str) -> Option<String> {
    let p = PathBuf::from(path);
    let p = if p.is_absolute() {
        p
    } else {
        paths::data_dir().join(p)
    };
    if p.is_file() {
        Some(p.to_string_lossy().to_string())
    } else {
        None
    }
}

fn account_view(account: &Account, active: bool) -> AccountView {
    let skin_path = account.skin.as_deref().and_then(resolve_skin);
    let has_skin = skin_path.is_some();
    let skin_data_url = skin_path.as_deref().and_then(ely::skin_data_url);
    AccountView {
        account: account.clone(),
        active,
        has_skin,
        skin_data_url,
    }
}

fn accounts_snapshot() -> (Vec<AccountView>, usize) {
    let data = accounts::load();
    let selected = data.selected;
    let views = data
        .accounts
        .iter()
        .enumerate()
        .map(|(i, a)| account_view(a, i == selected))
        .collect();
    (views, selected)
}

fn system_info() -> SystemInfo {
    let total = instances::total_ram_mb();
    SystemInfo {
        total_ram_mb: total,
        data_dir: paths::data_dir().to_string_lossy().to_string(),
        instances: instances::list().len(),
        java_hint: install_java_hint(),
    }
}

fn install_java_hint() -> Option<String> {
    for major in [25u32, 21, 17, 8] {
        if let Some(java) = crate::java::find_installed(major) {
            return Some(java);
        }
    }
    crate::install::find_java_fallback()
}

// ------------------------------------------------------------------ bootstrap
#[tauri::command]
pub async fn bootstrap() -> Result<Bootstrap, String> {
    let (account_views, selected) = accounts_snapshot();
    Ok(Bootstrap {
        config: store::load_config(),
        theme: store::load_theme(),
        presets: crate::models::presets(),
        accounts: account_views,
        selected,
        instances: instances::list(),
        system: system_info(),
    })
}

#[tauri::command]
pub fn tasks_snapshot() -> Vec<crate::models::TaskInfo> {
    tasks::snapshot()
}

#[tauri::command]
pub fn tasks_clear(app: AppHandle) {
    tasks::forget_finished(&app);
}

// -------------------------------------------------------------------- settings
#[tauri::command]
pub fn save_config(config: Config) -> Result<Config, String> {
    let mut config = config;
    config.world_backup_keep = config.world_backup_keep.clamp(3, 20);
    store::save_config(&config)?;
    Ok(config)
}

#[tauri::command]
pub fn save_theme(theme: Theme) -> Result<Theme, String> {
    store::save_theme(&theme)?;
    Ok(theme)
}

#[tauri::command]
pub fn apply_theme_preset(key: String) -> Result<Theme, String> {
    let mut theme = store::load_theme();
    let preset = crate::models::presets()
        .into_iter()
        .find(|p| p.key == key)
        .ok_or_else(|| format!("Пресет {key} не найден"))?;
    store::apply_preset(&mut theme, &preset);
    store::save_theme(&theme)?;
    Ok(theme)
}

#[tauri::command]
pub fn reset_theme() -> Result<Theme, String> {
    let theme = Theme::default();
    store::save_theme(&theme)?;
    Ok(theme)
}

#[tauri::command]
pub fn system_info_cmd() -> SystemInfo {
    system_info()
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Путь не существует: {path}"));
    }
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| format!("Не удалось открыть: {e}"))
}

#[tauri::command]
pub fn open_instance_folder(app: AppHandle, name: String) -> Result<(), String> {
    let dir = crate::paths::instance_dir(&name);
    if !dir.exists() {
        return Err(format!("Папка сборки «{name}» не найдена"));
    }
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Не удалось открыть папку: {e}"))
}

#[tauri::command]
pub async fn pick_file(kind: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        dialog = match kind.as_str() {
            "skin" => dialog.add_filter("Скин Minecraft", &["png"]),
            "modpack" => dialog.add_filter("Сборка Modrinth", &["mrpack", "zip"]),
            "archive" => dialog.add_filter("Архив", &["zip", "mrpack"]),
            "image" => dialog.add_filter("Изображение", &["png", "jpg", "jpeg", "webp", "gif"]),
            "video" => dialog.add_filter("Видео", &["mp4", "webm"]),
            "audio" => dialog.add_filter("Музыка", &["mp3", "ogg", "wav", "m4a", "flac"]),
            "font" => dialog.add_filter("Шрифт", &["ttf", "otf", "woff2", "woff"]),
            "java" => dialog.add_filter("Java", &["exe"]),
            _ => dialog,
        };
        dialog.pick_file().map(|p| p.to_string_lossy().to_string())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn pick_save_path(default_name: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_file_name(&default_name)
            .add_filter("Архив сборки", &["zip"])
            .save_file()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .ok()
    .flatten()
}

// ------------------------------------------------------------------- instances
#[tauri::command]
pub fn list_instances() -> Vec<InstanceView> {
    instances::list()
}

async fn run_install(app: AppHandle, name: String, mc: String, loader: String, lv: Option<String>) {
    let task = TaskHandle::new(&app, format!("Установка «{name}»"), "install");
    task.detail("Подготовка установки");
    {
        if let Ok(mut running) = INSTANCE_INSTALLS.lock() {
            running.insert(name.clone());
        }
    }

    let result = loaders::install_loader(&app, &mc, &loader, lv.as_deref(), Some(&name), Some(&task)).await;
    let mut finished = false;
    match result {
        Ok(vid) => {
            if let Some(mut meta) = instances::load(&name) {
                meta.version_id = Some(vid);
                meta.installed = true;
                meta.loader = loader;
                if lv.is_some() {
                    meta.loader_version = lv;
                }
                match instances::save(&meta) {
                    Ok(_) => finished = true,
                    Err(error) => task.fail(format!("Не удалось сохранить сборку: {error}")),
                }
            } else {
                task.fail("Сборка исчезла во время установки");
            }
        }
        Err(error) => task.fail(error),
    }

    // Сбрасываем флаг установки до финальных событий, чтобы UI не «залипал».
    if let Ok(mut running) = INSTANCE_INSTALLS.lock() {
        running.remove(&name);
    }
    // Финальный прогресс 100% и обновление списка сборок.
    if finished {
        task.finish();
    }
    let _ = app.emit("instances-changed", ());
}

#[tauri::command]
pub fn create_instance(app: AppHandle, payload: NewInstance) -> Result<Instance, String> {
    let existing = instances::list();
    if existing
        .iter()
        .any(|i| i.meta.name.eq_ignore_ascii_case(payload.name.trim()))
    {
        return Err("Сборка с таким названием уже существует".into());
    }
    let ram = payload.ram_mb.unwrap_or(4096);
    let meta = instances::create(
        &payload.name,
        &payload.mc_version,
        &payload.loader,
        payload.loader_version.clone(),
        &payload.icon,
        ram,
        Vec::new(),
    )?;

    let app2 = app.clone();
    let (name, mc, loader, lv) = (
        meta.name.clone(),
        meta.mc_version.clone(),
        meta.loader.clone(),
        meta.loader_version.clone(),
    );
    tauri::async_runtime::spawn(async move {
        run_install(app2, name, mc, loader, lv).await;
    });
    Ok(meta)
}

#[tauri::command]
pub fn install_instance(app: AppHandle, name: String) -> Result<(), String> {
    let meta = instances::load(&name).ok_or_else(|| format!("Сборка «{name}» не найдена"))?;
    if let Ok(running) = INSTANCE_INSTALLS.lock() {
        if running.contains(&name) {
            return Err("Установка этой сборки уже идёт — дождитесь завершения".into());
        }
    }
    let app2 = app.clone();
    let lv = meta.loader_version.clone();
    let loader = if meta.loader.is_empty() {
        "vanilla".to_string()
    } else {
        meta.loader.clone()
    };
    tauri::async_runtime::spawn(async move {
        run_install(app2, meta.name, meta.mc_version, loader, lv).await;
    });
    Ok(())
}

#[tauri::command]
pub fn update_instance(app: AppHandle, name: String, patch: InstancePatch) -> Result<Instance, String> {
    let meta = instances::update(&name, patch)?;
    let _ = app.emit("instances-changed", ());
    Ok(meta)
}

#[tauri::command]
pub fn delete_instance(app: AppHandle, name: String) -> Result<(), String> {
    instances::delete(&name)?;
    let _ = app.emit("instances-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn loader_versions(mc_version: String, loader: String) -> Result<Vec<String>, String> {
    Ok(loaders::loader_versions(&mc_version, &loader).await)
}

#[tauri::command]
pub async fn launch_instance(app: AppHandle, name: String) -> Result<LaunchInfo, String> {
    let task = TaskHandle::new(&app, format!("Запуск «{name}»"), "launch");
    match crate::launch::launch(&app, &name, Some(&task)).await {
        Ok(info) => {
            task.finish();
            Ok(info)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub fn default_jvm(ram_mb: Option<u32>) -> instances::JvmPlan {
    instances::optimal_jvm(ram_mb, 17)
}

// --------------------------------------------------------------------- content
#[tauri::command]
pub fn list_content(instance: String, kind: String) -> Vec<crate::models::ContentFile> {
    instances::list_content(&instance, &kind)
}

#[tauri::command]
pub fn toggle_content(path: String) -> Result<String, String> {
    instances::toggle_content(&path)
}

#[tauri::command]
pub fn delete_content(path: String) -> Result<(), String> {
    instances::delete_content(&path)
}

#[tauri::command]
pub async fn modrinth_search(
    query: String,
    kind: String,
    loader: Option<String>,
    mc_version: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<crate::models::ModrinthSearch, String> {
    modrinth::search(
        &query,
        &kind,
        loader.as_deref(),
        mc_version.as_deref(),
        limit.unwrap_or(20),
        offset.unwrap_or(0),
    )
    .await
}

#[tauri::command]
pub async fn modrinth_install(
    app: AppHandle,
    project_id: String,
    kind: String,
    instance: String,
) -> Result<Vec<String>, String> {
    let task = TaskHandle::new(&app, "Установка мода", "modrinth");
    let result = modrinth::install_to_instance(&project_id, &kind, &instance, Some(&task)).await;
    match result {
        Ok(files) => {
            task.finish();
            let _ = app.emit("instances-changed", ());
            Ok(files)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn ultra_fps(app: AppHandle, instance: String) -> Result<UltraFpsResult, String> {
    let task = TaskHandle::new(&app, "Ультра FPS", "fps");
    let result = modrinth::ultra_fps(&app, &instance, Some(&task)).await;
    match result {
        Ok(plan) => {
            task.finish();
            let _ = app.emit("instances-changed", ());
            Ok(plan)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

// -------------------------------------------------------------------- accounts
#[tauri::command]
pub fn accounts_snapshot_cmd() -> (Vec<AccountView>, usize) {
    accounts_snapshot()
}

#[tauri::command]
pub fn account_select(index: usize) -> Result<(Vec<AccountView>, usize), String> {
    accounts::set_selected(index)?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub fn account_remove(index: usize) -> Result<(Vec<AccountView>, usize), String> {
    accounts::remove(index)?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub fn account_add_offline(name: String) -> Result<(Vec<AccountView>, usize), String> {
    let clean = name.trim();
    if clean.is_empty() {
        return Err("Введите никнейм".into());
    }
    if clean.len() > 16 {
        return Err("Никнейм длиннее 16 символов не поддерживается Minecraft".into());
    }
    accounts::upsert_offline(clean, None)?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub fn account_rename(index: usize, name: String) -> Result<(Vec<AccountView>, usize), String> {
    let clean = name.trim();
    if clean.is_empty() || clean.len() > 16 {
        return Err("Никнейм должен быть от 1 до 16 символов".into());
    }
    accounts::rename(index, clean)?;
    Ok(accounts_snapshot())
}

fn import_skin(index: usize, source: &str) -> Result<(Vec<AccountView>, usize), String> {
    let data = accounts::load();
    let account = data
        .accounts
        .get(index)
        .ok_or_else(|| "Аккаунт не найден".to_string())?;
    let bytes = std::fs::read(source).map_err(|e| format!("Скин: {e}"))?;
    if bytes.len() < 64 {
        return Err("Файл скина слишком маленький".into());
    }
    let dest = paths::skins_dir().join(format!("{}.png", paths::safe_name(&account.name)));
    std::fs::write(&dest, bytes).map_err(|e| format!("Скин: {e}"))?;
    accounts::set_skin(index, &dest.to_string_lossy())?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub fn account_set_skin_path(
    index: usize,
    path: String,
) -> Result<(Vec<AccountView>, usize), String> {
    import_skin(index, &path)
}

#[tauri::command]
pub async fn account_pick_skin(index: usize) -> Result<Option<(Vec<AccountView>, usize)>, String> {
    let Some(path) = pick_file("skin".into()).await else {
        return Ok(None);
    };
    import_skin(index, &path).map(Some)
}

#[tauri::command]
pub fn account_skin_data(index: usize) -> Option<String> {
    let data = accounts::load();
    let account = data.accounts.get(index)?;
    let path = account.skin.as_deref().and_then(resolve_skin)?;
    ely::skin_data_url(&path)
}

#[tauri::command]
pub async fn ely_login(
    username: String,
    password: String,
) -> Result<(Vec<AccountView>, usize), String> {
    if username.trim().is_empty() || password.is_empty() {
        return Err("Введите логин и пароль Ely.by".into());
    }
    let session = ely::login(username.trim(), &password, None).await?;
    let skin = ely::download_skin(&session.name)
        .await
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    accounts::upsert_ely(&session, skin)?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub async fn ely_add_nick(nick: String) -> Result<(Vec<AccountView>, usize), String> {
    let clean = nick.trim();
    if clean.is_empty() {
        return Err("Введите никнейм Ely.by".into());
    }
    let skin = ely::download_skin(clean)
        .await
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    accounts::upsert_ely_guest(clean, skin)?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub async fn account_refresh_skin(index: usize) -> Result<(Vec<AccountView>, usize), String> {
    let data = accounts::load();
    let account = data
        .accounts
        .get(index)
        .ok_or_else(|| "Аккаунт не найден".to_string())?;
    let nick = account
        .ely_username
        .clone()
        .or_else(|| {
            if account.kind == "ely" {
                Some(account.name.clone())
            } else {
                None
            }
        })
        .ok_or_else(|| "У аккаунта нет профиля Ely.by".to_string())?;
    let path = ely::download_skin(&nick).await?;
    accounts::set_skin(index, &path.to_string_lossy())?;
    Ok(accounts_snapshot())
}

#[tauri::command]
pub async fn ely_textures(nick: String) -> Option<serde_json::Value> {
    ely::textures(&nick).await
}

// --------------------------------------------------------- microsoft (Mojang)
#[derive(Debug, Serialize)]
pub struct MicrosoftPoll {
    /// pending | slow_down | ok
    pub status: String,
    pub message: Option<String>,
    pub accounts: Option<Vec<AccountView>>,
    pub selected: Option<usize>,
}

#[tauri::command]
pub async fn microsoft_login_start() -> Result<auth::DeviceCode, String> {
    auth::start_device_code().await
}

#[tauri::command]
pub async fn microsoft_login_poll(device_code: String) -> Result<MicrosoftPoll, String> {
    match auth::poll_device_code(&device_code).await? {
        auth::PollOutcome::Pending => Ok(MicrosoftPoll {
            status: "pending".into(),
            message: Some("Ожидаем подтверждение на microsoft.com/link".into()),
            accounts: None,
            selected: None,
        }),
        auth::PollOutcome::SlowDown => Ok(MicrosoftPoll {
            status: "slow_down".into(),
            message: Some("Microsoft просит подождать перед следующей проверкой".into()),
            accounts: None,
            selected: None,
        }),
        auth::PollOutcome::Ready(session) => {
            let skin = auth::download_skin(&session).await;
            accounts::upsert_microsoft(&session, skin)?;
            let (views, selected) = accounts_snapshot();
            Ok(MicrosoftPoll {
                status: "ok".into(),
                message: Some(format!("Вход выполнен: {}", session.name)),
                accounts: Some(views),
                selected: Some(selected),
            })
        }
    }
}

#[tauri::command]
pub async fn microsoft_refresh_account(
    index: usize,
) -> Result<(Vec<AccountView>, usize), String> {
    let data = accounts::load();
    let account = data
        .accounts
        .get(index)
        .ok_or_else(|| "Аккаунт не найден".to_string())?;
    if account.kind != "microsoft" {
        return Err("Это не Microsoft-аккаунт".into());
    }
    let refresh = account
        .refresh_token
        .clone()
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Нет refresh token — войдите через Microsoft заново".to_string())?;
    let session = auth::refresh_session(&refresh).await?;
    accounts::update_microsoft(index, &session)?;
    let skin = auth::download_skin(&session).await;
    if let Some(path) = skin {
        accounts::set_skin(index, &path)?;
    }
    Ok(accounts_snapshot())
}

// -------------------------------------------------------------------- modpacks
fn modrinth_unified_hit(hit: crate::models::ModrinthHit) -> ModpackHit {
    let loaders: Vec<String> = hit
        .categories
        .iter()
        .filter(|c| matches!(c.as_str(), "fabric" | "forge" | "neoforge" | "quilt"))
        .cloned()
        .collect();
    ModpackHit {
        id: format!("modrinth:{}", hit.project_id),
        source: "modrinth".into(),
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        author: hit.author,
        downloads: hit.downloads,
        icon_url: hit.icon_url,
        categories: hit.categories.clone(),
        versions: hit.versions,
        loaders,
        available: true,
    }
}

fn interleave(a: Vec<ModpackHit>, b: Vec<ModpackHit>) -> Vec<ModpackHit> {
    let mut out = Vec::with_capacity(a.len() + b.len());
    let mut ai = a.into_iter();
    let mut bi = b.into_iter();
    loop {
        let mut pushed = false;
        if let Some(item) = ai.next() {
            out.push(item);
            pushed = true;
        }
        if let Some(item) = bi.next() {
            out.push(item);
            pushed = true;
        }
        if !pushed {
            break;
        }
    }
    out
}

/// Поиск модов/шейдеров/ресурспаков в Modrinth и CurseForge.
#[tauri::command]
pub async fn content_search(
    query: String,
    kind: String,
    source: String,
    loader: Option<String>,
    mc_version: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<ModpackSearch, String> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(20).clamp(1, 40);
    let source = source.to_lowercase();
    let kind = match kind.to_lowercase().as_str() {
        "mod" | "mods" => "mod",
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => "shader",
        "resourcepack" | "resourcepacks" | "texturepack" | "texturepacks" => "resourcepack",
        other => return Err(format!("Неизвестный тип контента: {other}")),
    };
    let loader = loader.filter(|l| !l.is_empty() && l != "vanilla");
    let mc_version = mc_version.filter(|v| !v.trim().is_empty());
    // Загрузчик применим только к модам.
    let loader = if kind == "mod" { loader } else { None };

    let want_modrinth = source == "all" || source == "modrinth";
    let want_curse = source == "all" || source == "curseforge";
    if !want_modrinth && !want_curse {
        return Err(format!("Неизвестный источник: {source}"));
    }
    let per_source = if want_modrinth && want_curse {
        (limit + 1) / 2
    } else {
        limit
    };

    let mut hits: Vec<ModpackHit> = Vec::new();
    let mut total: u64 = 0;
    let mut notice: Option<String> = None;

    if want_modrinth {
        match modrinth::search(
            &query,
            &kind,
            loader.as_deref(),
            mc_version.as_deref(),
            per_source,
            offset,
        )
        .await
        {
            Ok(res) => {
                total += res.total_hits;
                hits = res.hits.into_iter().map(modrinth_unified_hit).collect();
            }
            Err(e) => {
                if !want_curse {
                    return Err(e);
                }
                eprintln!("[content_search] modrinth: {e}");
                notice =
                    Some("Modrinth временно недоступен — показаны результаты CurseForge.".into());
            }
        }
    }

    if want_curse {
        match curse::search_content(
            &query,
            &kind,
            loader.as_deref(),
            mc_version.as_deref(),
            per_source,
            offset,
        )
        .await
        {
            Ok(res) => {
                total += res.total_hits;
                hits = if hits.is_empty() {
                    res.hits
                } else {
                    interleave(hits, res.hits)
                };
            }
            Err(e) => {
                if !want_modrinth {
                    return Err(e);
                }
                eprintln!("[content_search] curseforge: {e}");
                notice = Some(
                    "CurseForge временно недоступен — показаны результаты Modrinth. Проверьте подключение к интернету и повторите позже."
                        .into(),
                );
            }
        }
    }

    hits.truncate(limit as usize);
    Ok(ModpackSearch {
        hits,
        total_hits: total,
        offset: offset as u64,
        notice,
    })
}

async fn install_curse_content(
    project_id: &str,
    kind: &str,
    instance: &str,
    task: &TaskHandle,
) -> Result<Vec<String>, String> {
    let meta = instances::load(instance)
        .ok_or_else(|| format!("Сборка «{instance}» не найдена"))?;
    let id: u64 = project_id
        .parse()
        .map_err(|_| format!("Некорректный id CurseForge: {project_id}"))?;
    let loader = if kind == "mod" && meta.loader != "vanilla" {
        Some(meta.loader.as_str())
    } else {
        None
    };

    task.detail("Поиск файла CurseForge");
    let info = curse::content_file(id, kind, loader, Some(meta.mc_version.as_str())).await?;
    let target = instances::content_dir(&meta.name, kind);
    std::fs::create_dir_all(&target).map_err(|e| format!("Папка контента: {e}"))?;
    let dest = target.join(paths::safe_name(&info.filename));

    task.detail("Скачивание файла CurseForge");
    http::download_file(&info.url, &dest, info.sha1.as_deref(), Some(task)).await?;
    let name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or(info.filename);
    Ok(vec![name])
}

/// Установить мод/шейдер/ресурспак в сборку из выбранного источника.
#[tauri::command]
pub async fn content_install(
    app: AppHandle,
    source: String,
    project_id: String,
    kind: String,
    instance: String,
) -> Result<Vec<String>, String> {
    let source = source.to_lowercase();
    let kind = match kind.to_lowercase().as_str() {
        "mod" | "mods" => "mod",
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => "shader",
        "resourcepack" | "resourcepacks" | "texturepack" | "texturepacks" => "resourcepack",
        other => return Err(format!("Неизвестный тип контента: {other}")),
    };

    let key = format!("content:{source}:{project_id}:{kind}:{instance}");
    {
        let mut running = INSTALL_LOCK
            .lock()
            .map_err(|_| "Внутренняя блокировка установки недоступна".to_string())?;
        if !running.insert(key.clone()) {
            return Err("Этот файл уже устанавливается — дождитесь завершения".into());
        }
    }

    let task = TaskHandle::new(&app, "Установка контента", "content");
    let result = if source == "curseforge" {
        install_curse_content(&project_id, &kind, &instance, &task).await
    } else {
        modrinth::install_to_instance(&project_id, &kind, &instance, Some(&task)).await
    };

    if let Ok(mut running) = INSTALL_LOCK.lock() {
        running.remove(&key);
    }

    match result {
        Ok(files) => {
            task.finish();
            let _ = app.emit("instances-changed", ());
            Ok(files)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

/// Полный список официальных релизов Minecraft (с резервным списком).
#[tauri::command]
pub async fn minecraft_versions() -> Vec<String> {
    if let Ok(cache) = MC_VERSIONS_CACHE.lock() {
        if let Some(list) = cache.as_ref() {
            return list.clone();
        }
    }

    let fallback = || {
        MC_VERSION_FALLBACK
            .iter()
            .map(|version| version.to_string())
            .collect::<Vec<_>>()
    };

    let versions = match version::fetch_manifest().await {
        Ok(entries) => {
            let releases: Vec<String> = entries
                .into_iter()
                .filter(|entry| entry.kind == "release")
                .map(|entry| entry.id)
                .collect();
            if releases.is_empty() {
                fallback()
            } else {
                releases
            }
        }
        Err(e) => {
            eprintln!("[minecraft_versions] {e}");
            fallback()
        }
    };

    if let Ok(mut cache) = MC_VERSIONS_CACHE.lock() {
        *cache = Some(versions.clone());
    }
    versions
}

#[tauri::command]
pub async fn modpack_search(
    query: String,
    source: String,
    loader: Option<String>,
    mc_version: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<ModpackSearch, String> {
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(20).clamp(1, 40);
    let source = source.to_lowercase();
    let loader = loader.filter(|l| !l.is_empty() && l != "vanilla");
    let mc_version = mc_version.filter(|v| !v.trim().is_empty());

    let want_modrinth = source == "all" || source == "modrinth";
    let want_curse = source == "all" || source == "curseforge";
    if !want_modrinth && !want_curse {
        return Err(format!("Неизвестный источник: {source}"));
    }
    let per_source = if want_modrinth && want_curse {
        (limit + 1) / 2
    } else {
        limit
    };

    let mut hits: Vec<ModpackHit> = Vec::new();
    let mut total: u64 = 0;
    let mut notice: Option<String> = None;

    if want_modrinth {
        match modrinth::search(
            &query,
            "modpack",
            loader.as_deref(),
            mc_version.as_deref(),
            per_source,
            offset,
        )
        .await
        {
            Ok(res) => {
                total += res.total_hits;
                let mapped: Vec<ModpackHit> =
                    res.hits.into_iter().map(modrinth_unified_hit).collect();
                hits = mapped;
            }
            Err(e) => {
                if !want_curse {
                    return Err(e);
                }
                eprintln!("[modpack_search] modrinth: {e}");
                notice =
                    Some("Modrinth временно недоступен — показаны результаты CurseForge.".into());
            }
        }
    }

    if want_curse {
        match curse::search(
            &query,
            loader.as_deref(),
            mc_version.as_deref(),
            per_source,
            offset,
        )
        .await
        {
            Ok(res) => {
                total += res.total_hits;
                let mapped = res.hits;
                hits = if hits.is_empty() {
                    mapped
                } else {
                    interleave(hits, mapped)
                };
            }
            Err(e) => {
                if !want_modrinth {
                    return Err(e);
                }
                eprintln!("[modpack_search] curseforge: {e}");
                notice = Some(
                    "CurseForge временно недоступен — показаны результаты Modrinth. Проверьте подключение к интернету и повторите позже."
                        .into(),
                );
            }
        }
    }

    hits.truncate(limit as usize);
    Ok(ModpackSearch {
        hits,
        total_hits: total,
        offset: offset as u64,
        notice,
    })
}

async fn install_modpack_inner(
    app: &AppHandle,
    source: &str,
    project_id: &str,
    name: Option<String>,
    icon_url: Option<String>,
    mc_version: Option<String>,
    loader: Option<String>,
) -> Result<ImportResult, String> {
    let task = TaskHandle::new(app, "Установка готовой сборки", "modpack");
    let result = install_modpack_files(
        app,
        source,
        project_id,
        name,
        icon_url,
        mc_version,
        loader,
        &task,
    )
    .await;
    match result {
        Ok(res) => {
            task.finish();
            let _ = app.emit("instances-changed", ());
            Ok(res)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn install_modpack_files(
    app: &AppHandle,
    source: &str,
    project_id: &str,
    name: Option<String>,
    icon_url: Option<String>,
    mc_version: Option<String>,
    loader: Option<String>,
    task: &TaskHandle,
) -> Result<ImportResult, String> {
    let (url, filename, sha1) = if source == "curseforge" {
        let id: u64 = project_id
            .parse()
            .map_err(|_| format!("Некорректный id CurseForge: {project_id}"))?;
        let info = curse::pack_file(id, loader.as_deref(), mc_version.as_deref()).await?;
        (info.url, info.filename, info.sha1)
    } else {
        modrinth::pack_file(project_id, loader.as_deref(), mc_version.as_deref()).await?
    };

    let cache = paths::sub("cache");
    let dest = cache.join(paths::safe_name(&filename));
    task.detail("Скачивание манифеста сборки");
    http::download_file(&url, &dest, sha1.as_deref(), Some(task)).await?;

    let imported = archive::import(
        app,
        &dest,
        name,
        mc_version,
        loader,
        None,
        icon_url,
        Some(task),
    )
    .await;
    let _ = std::fs::remove_file(&dest);
    imported
}

/// Установить готовую сборку (Modrinth `.mrpack` / CurseForge `manifest.json`)
/// как новую отдельную сборку во вкладке «Сборки».
#[tauri::command]
pub async fn modpack_install(
    app: AppHandle,
    source: String,
    project_id: String,
    name: Option<String>,
    icon_url: Option<String>,
    mc_version: Option<String>,
    loader: Option<String>,
) -> Result<ImportResult, String> {
    let source = source.to_lowercase();
    let key = format!("modpack:{source}:{project_id}");
    {
        let mut running = INSTALL_LOCK
            .lock()
            .map_err(|_| "Внутренняя блокировка установки недоступна".to_string())?;
        if !running.insert(key.clone()) {
            return Err("Эта сборка уже устанавливается — дождитесь завершения".into());
        }
    }

    let result = install_modpack_inner(
        &app,
        &source,
        &project_id,
        name,
        icon_url,
        mc_version,
        loader,
    )
    .await;

    if let Ok(mut running) = INSTALL_LOCK.lock() {
        running.remove(&key);
    }
    result
}

// ---------------------------------------------------------------- backup
#[tauri::command]
pub fn list_world_backups(instance: String) -> Vec<backups::WorldBackup> {
    backups::list(&instance)
}

#[tauri::command]
pub async fn backup_worlds_now(
    app: AppHandle,
    instance: String,
    auto: Option<bool>,
) -> Result<Vec<backups::WorldBackup>, String> {
    {
        let mut running = BACKUP_LOCK
            .lock()
            .map_err(|_| "Внутренняя блокировка бэкапа недоступна".to_string())?;
        if !running.insert(instance.clone()) {
            return Err("Бэкап этой сборки уже идёт — дождитесь завершения".into());
        }
    }

    let task = TaskHandle::new(&app, format!("Бэкап миров «{instance}»"), "backup");
    let automatic = auto.unwrap_or(false);
    let keep = store::load_config().world_backup_keep;
    let name = instance.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        backups::backup_worlds(&name, automatic, keep)
    })
    .await;

    if let Ok(mut running) = BACKUP_LOCK.lock() {
        running.remove(&instance);
    }
    let _ = app.emit(
        "backups-changed",
        serde_json::json!({ "instance": instance }),
    );

    match result {
        Ok(Ok(list)) => {
            task.finish();
            Ok(list)
        }
        Ok(Err(e)) => {
            task.fail(e.clone());
            Err(e)
        }
        Err(e) => {
            let message = format!("Бэкап миров: {e}");
            task.fail(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn restore_world_backup(
    app: AppHandle,
    instance: String,
    path: String,
) -> Result<backups::RestoreResult, String> {
    let name = instance.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || backups::restore(&name, Path::new(&path)))
            .await
            .map_err(|e| format!("Восстановление мира: {e}"))?;
    let _ = app.emit(
        "backups-changed",
        serde_json::json!({ "instance": instance }),
    );
    result
}

#[tauri::command]
pub fn delete_world_backup(app: AppHandle, instance: String, path: String) -> Result<(), String> {
    backups::delete(&instance, Path::new(&path))?;
    let _ = app.emit(
        "backups-changed",
        serde_json::json!({ "instance": instance }),
    );
    Ok(())
}

#[tauri::command]
pub fn open_backups_folder(app: AppHandle, instance: String) -> Result<(), String> {
    let dir = backups::root(&instance);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Не удалось открыть папку: {e}"))
}

// ---------------------------------------------------------------- импорт
#[tauri::command]
pub async fn scan_other_launchers() -> Result<launcher_import::LauncherScan, String> {
    tauri::async_runtime::spawn_blocking(launcher_import::scan)
        .await
        .map_err(|e| format!("Сканирование лаунчеров: {e}"))
}

#[tauri::command]
pub async fn inspect_launcher_folder(
    path: String,
) -> Result<launcher_import::FoundInstance, String> {
    tauri::async_runtime::spawn_blocking(move || launcher_import::inspect_folder(Path::new(&path)))
        .await
        .map_err(|e| format!("Проверка папки: {e}"))?
}

#[tauri::command]
pub async fn import_other_instances(
    app: AppHandle,
    items: Vec<launcher_import::ImportItem>,
) -> Result<launcher_import::ImportSummary, String> {
    if items.is_empty() {
        return Err("Не выбрано ни одной сборки".into());
    }
    let task = std::sync::Arc::new(TaskHandle::new(&app, "Импорт сборок", "import"));
    let app2 = app.clone();
    let task2 = task.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        launcher_import::import(&app2, &items, &task2)
    })
    .await;
    let _ = app.emit("instances-changed", ());
    match result {
        Ok(summary) => {
            task.finish();
            Ok(summary)
        }
        Err(e) => {
            let message = format!("Импорт сборок: {e}");
            task.fail(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub async fn pick_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn analyze_crash(instance: String, exit_code: Option<i32>) -> Result<CrashReport, String> {
    Ok(crash::analyze(&instance, exit_code))
}

#[tauri::command]
pub fn crash_report_text(report: CrashReport) -> String {
    crash::as_text(&report)
}

// --------------------------------------------------------------------- archive
#[tauri::command]
pub async fn import_modpack(
    app: AppHandle,
    path: String,
    name: Option<String>,
    mc_version: Option<String>,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<crate::models::ImportResult, String> {
    let task = TaskHandle::new(&app, "Импорт сборки", "import");
    let result = archive::import(
        &app,
        &PathBuf::from(&path),
        name,
        mc_version,
        loader,
        loader_version,
        None,
        Some(&task),
    )
    .await;
    let _ = app.emit("instances-changed", ());
    match result {
        Ok(res) => {
            task.finish();
            Ok(res)
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn export_instance(
    app: AppHandle,
    name: String,
    dest: String,
) -> Result<String, String> {
    let task = TaskHandle::new(&app, format!("Экспорт «{name}»"), "export");
    let result = tauri::async_runtime::spawn_blocking(move || {
        archive::export(&name, &Path::new(&dest), None)
    })
    .await
    .map_err(|e| e.to_string())?;
    match result {
        Ok(path) => {
            task.finish();
            Ok(path.to_string_lossy().to_string())
        }
        Err(e) => {
            task.fail(e.clone());
            Err(e)
        }
    }
}
