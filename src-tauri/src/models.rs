//! Модели данных, совместимые по JSON-полям с Python-версией.

use serde::{Deserialize, Serialize};

// ------------------------------------------------------------------ config
fn default_language() -> String {
    "ru_ru".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub username: String,
    pub ram_mb: u32,
    pub java_path: String,
    pub last_version: String,
    pub last_page: String,
    pub theme: String,
    pub last_instance: String,
    /// Дополнительно к Python: сколько раз и когда запускались игры.
    pub default_ram_mb: u32,
    /// Язык Minecraft по умолчанию — пишется в options.txt перед стартом.
    #[serde(default = "default_language")]
    pub game_language: String,
    /// Сворачивать окно лаунчера на время игры.
    #[serde(default = "default_true")]
    pub auto_minimize: bool,
    /// Глобальные JVM-аргументы (дополняют аргументы сборки).
    pub jvm_args: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            username: "Player".into(),
            ram_mb: 2048,
            java_path: String::new(),
            last_version: String::new(),
            last_page: "home".into(),
            theme: "dark".into(),
            last_instance: String::new(),
            default_ram_mb: 4096,
            game_language: default_language(),
            auto_minimize: true,
            jvm_args: Vec::new(),
        }
    }
}

// ------------------------------------------------------------------- theme
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Theme {
    pub preset: String,
    pub accent: String,
    pub bg: String,
    pub panel: String,
    pub panel2: String,
    pub fg: String,
    pub muted: String,
    pub glass: f32,
    pub radius: u32,
    pub font: String,
    pub bg_image: String,
    pub bg_dim: f32,
    pub bg_blur: f32,
    pub audio: String,
    pub volume: f32,
    /// Видео-обои (.mp4 / .webm) — новое в Tauri-версии.
    pub bg_video: String,
    pub bg_video_muted: bool,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            preset: "dark".into(),
            accent: "#5E6AD2".into(),
            bg: "#0C0D10".into(),
            panel: "#13151B".into(),
            panel2: "#1A1D24".into(),
            fg: "#EDEEF2".into(),
            muted: "#8B90A0".into(),
            glass: 0.72,
            radius: 12,
            font: "Segoe UI".into(),
            bg_image: String::new(),
            bg_dim: 0.45,
            bg_blur: 8.0,
            audio: String::new(),
            volume: 0.45,
            bg_video: String::new(),
            bg_video_muted: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ThemePreset {
    pub key: String,
    pub name: String,
    pub accent: String,
    pub bg: String,
    pub panel: String,
    pub panel2: String,
    pub fg: String,
    pub muted: String,
}

pub fn presets() -> Vec<ThemePreset> {
    let raw = [
        ("dark", "Графит", "#5E6AD2", "#0C0D10", "#13151B", "#1A1D24", "#EDEEF2", "#8B90A0"),
        ("cyberpunk", "Киберпанк", "#ff2e97", "#0d0221", "#170a3d", "#251357", "#00fff9", "#9d7bd8"),
        ("minimal", "Минимализм", "#4f46e5", "#f4f4f7", "#ffffff", "#e6e6ee", "#1f2937", "#6b7280"),
        ("light", "Светлая", "#0ea5e9", "#e9eff6", "#ffffff", "#d7e2ee", "#0f172a", "#5b6b7f"),
    ];
    raw.iter()
        .map(|r| ThemePreset {
            key: r.0.into(),
            name: r.1.into(),
            accent: r.2.into(),
            bg: r.3.into(),
            panel: r.4.into(),
            panel2: r.5.into(),
            fg: r.6.into(),
            muted: r.7.into(),
        })
        .collect()
}

// ---------------------------------------------------------------- accounts
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Account {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String, // offline | ely | microsoft
    pub skin: Option<String>,
    pub ely: Option<String>,
    pub uuid: Option<String>,
    pub access_token: Option<String>,
    pub client_token: Option<String>,
    pub ely_username: Option<String>,
    /// Microsoft OAuth refresh token (личный аккаунт Mojang).
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Unix-время истечения Minecraft access token.
    #[serde(default)]
    pub expires_at: Option<f64>,
    /// Xbox User ID из XSTS — нужен для auth_xuid при запуске.
    #[serde(default)]
    pub xuid: Option<String>,
}

impl Default for Account {
    fn default() -> Self {
        Self {
            name: "Player".into(),
            kind: "offline".into(),
            skin: None,
            ely: None,
            uuid: None,
            access_token: None,
            client_token: None,
            ely_username: None,
            refresh_token: None,
            expires_at: None,
            xuid: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Accounts {
    pub selected: usize,
    pub accounts: Vec<Account>,
}

impl Default for Accounts {
    fn default() -> Self {
        Self {
            selected: 0,
            accounts: vec![Account::default()],
        }
    }
}

impl Accounts {
    pub fn current(&self) -> Account {
        if self.accounts.is_empty() {
            return Account::default();
        }
        let idx = self.selected.min(self.accounts.len() - 1);
        self.accounts[idx].clone()
    }
}

// --------------------------------------------------------------- instances
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Instance {
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub version_id: Option<String>,
    pub icon: String,
    /// URL иконки модпака (если сборка создана из готового модпака).
    pub icon_url: String,
    pub ram_mb: u32,
    pub jvm_args: Vec<String>,
    /// Ручной путь к Java для этой сборки. Пусто — авто-подбор по версии MC.
    pub java_path: String,
    pub created: f64,
    pub last_played: f64,
    pub installed: bool,
    /// Наигранное время в секундах (новое поле, старое читается как 0).
    pub playtime_seconds: u64,
    /// Быстрый вход: "off" | "singleplayer" | "multiplayer"
    pub quick_play_mode: String,
    pub quick_play_target: String,
    /// Последняя установка Ultra FPS.
    pub ultra_fps_at: f64,
    /// Язык Minecraft — записывается в options.txt перед запуском.
    #[serde(default = "default_language")]
    pub game_language: String,
}

impl Default for Instance {
    fn default() -> Self {
        Self {
            name: "Новая сборка".into(),
            mc_version: "1.20.1".into(),
            loader: "fabric".into(),
            loader_version: None,
            version_id: None,
            icon: "▣".into(),
            icon_url: String::new(),
            ram_mb: 4096,
            jvm_args: Vec::new(),
            java_path: String::new(),
            created: 0.0,
            last_played: 0.0,
            installed: false,
            playtime_seconds: 0,
            quick_play_mode: "off".into(),
            quick_play_target: String::new(),
            ultra_fps_at: 0.0,
            game_language: default_language(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct InstancePatch {
    pub name: Option<String>,
    pub ram_mb: Option<u32>,
    pub jvm_args: Option<Vec<String>>,
    pub java_path: Option<String>,
    pub icon: Option<String>,
    pub quick_play_mode: Option<String>,
    pub quick_play_target: Option<String>,
    pub game_language: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstanceView {
    #[serde(flatten)]
    pub meta: Instance,
    pub playtime_hours: f64,
    pub version_ready: bool,
    pub mods_count: usize,
}

// ------------------------------------------------------------------- tasks
#[derive(Debug, Clone, Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub done: u64,
    pub total: u64,
    pub speed: f64,
    /// running | done | error
    pub state: String,
    pub detail: String,
}

// -------------------------------------------------------------- minecraft
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    #[serde(default)]
    pub release_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MojangManifest {
    #[serde(default)]
    pub latest: serde_json::Value,
    pub versions: Vec<VersionEntry>,
}

// ---------------------------------------------------------------- content
#[derive(Debug, Clone, Serialize)]
pub struct ContentFile {
    pub file: String,
    pub path: String,
    pub enabled: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthHit {
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearch {
    #[serde(default)]
    pub hits: Vec<ModrinthHit>,
    #[serde(default)]
    pub total_hits: u64,
    #[serde(default)]
    pub offset: u64,
}

// --------------------------------------------------------------- modpacks
/// Универсальный результат поиска готовых сборок (Modrinth + CurseForge).
#[derive(Debug, Clone, Serialize)]
pub struct ModpackHit {
    /// `modrinth:<project_id>` или `curseforge:<mod_id>`.
    pub id: String,
    /// `modrinth` | `curseforge`
    pub source: String,
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
    pub loaders: Vec<String>,
    /// Доступно ли скачивание файла на стороне источника.
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModpackSearch {
    pub hits: Vec<ModpackHit>,
    pub total_hits: u64,
    pub offset: u64,
    /// Подсказка, если один из источников (например, CurseForge) недоступен.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}

// ------------------------------------------------------------------- crash
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashCause {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashReport {
    pub title: String,
    pub intro: String,
    pub causes: Vec<CrashCause>,
    pub log_path: Option<String>,
    pub tail: String,
    pub exit_code: Option<i32>,
}

// -------------------------------------------------------------------- misc
#[derive(Debug, Clone, Serialize)]
pub struct LaunchInfo {
    pub instance: String,
    pub java: String,
    pub arg_count: usize,
    pub command_preview: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub instance: Instance,
    pub installed_files: usize,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UltraFpsResult {
    pub ram_mb: u32,
    pub gc: String,
    pub mods: Vec<String>,
    pub jvm_args: Vec<String>,
    pub failed: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub total_ram_mb: u64,
    pub data_dir: String,
    pub instances: usize,
    pub java_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountView {
    #[serde(flatten)]
    pub account: Account,
    pub active: bool,
    pub has_skin: bool,
    pub skin_data_url: Option<String>,
}
