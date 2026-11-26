//! Импорт сборок из других лаунчеров: Prism, MultiMC, Modrinth App, CurseForge
//! и обычная папка `.minecraft` (TLauncher/официальный лаунчер).
//!
//! Только чтение чужих каталогов: копируем контент (моды, конфиги, миры) в
//! собственную сборку, не трогая источник.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::instances;
use crate::models::{Config, ImportResult};
use crate::paths;
use crate::store;
use crate::tasks::TaskHandle;

const MAX_SKIPPED: usize = 50;
const ENTRY_LIMIT: usize = 200_000;
const SIZE_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
/// Служебные каталоги, которые не считаем в размер импортируемой сборки.
const SKIP_SIZE_DIRS: [&str; 9] = [
    "libraries",
    "versions",
    "assets",
    "objects",
    "logs",
    "crash-reports",
    "downloads",
    ".cache",
    ".git",
];
/// Что переносим из чужой сборки.
const COPY_DIRS: [&str; 5] = ["mods", "config", "resourcepacks", "shaderpacks", "saves"];
const COPY_FILES: [&str; 2] = ["options.txt", "servers.dat"];

#[derive(Debug, Clone, Serialize)]
pub struct LauncherInfo {
    pub source: String,
    pub name: String,
    pub path: String,
    pub instances: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FoundInstance {
    pub id: String,
    pub source: String,
    pub launcher: String,
    pub name: String,
    pub path: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub icon: Option<String>,
    pub mods: usize,
    pub worlds: usize,
    pub size_bytes: u64,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LauncherScan {
    pub launchers: Vec<LauncherInfo>,
    pub instances: Vec<FoundInstance>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportItem {
    pub path: String,
    pub source: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
    #[serde(default)]
    pub loader_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportSummary {
    pub imported: Vec<ImportResult>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Тип чужой сборки — определяет, как искать игровой каталог и метаданные.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Prism,
    Modrinth,
    Curse,
    Minecraft,
}

/// Разобранное описание сборки чужого лаунчера.
struct Detected {
    /// Каталог с `mods`/`config`/`saves`.
    content: PathBuf,
    name: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    icon: Option<String>,
}

// ------------------------------------------------------------------- scan

pub fn scan() -> LauncherScan {
    let imported = imported_sources();
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = LauncherScan {
        launchers: Vec::new(),
        instances: Vec::new(),
        warnings: Vec::new(),
    };

    if let Some(appdata) = env_dir("APPDATA") {
        scan_prism_root(
            &appdata.join("PrismLauncher").join("instances"),
            "prism",
            "Prism Launcher",
            &imported,
            &mut seen,
            &mut out,
        );
        scan_prism_root(
            &appdata.join("MultiMC").join("instances"),
            "multimc",
            "MultiMC",
            &imported,
            &mut seen,
            &mut out,
        );
        scan_modrinth_root(
            &appdata.join("com.modrinth.theseus").join("profiles"),
            &imported,
            &mut seen,
            &mut out,
        );
        scan_modrinth_root(
            &appdata.join("ModrinthApp").join("profiles"),
            &imported,
            &mut seen,
            &mut out,
        );

        let dot = appdata.join(".minecraft");
        if dot.is_dir() && seen.insert(normalize_path(&dot)) {
            let detected = minecraft_detected(&dot);
            out.instances.push(found(
                &dot,
                "minecraft",
                "Minecraft / TLauncher",
                detected,
                &imported,
            ));
            out.launchers.push(LauncherInfo {
                source: "minecraft".into(),
                name: "Minecraft / TLauncher".into(),
                path: dot.to_string_lossy().to_string(),
                instances: 1,
            });
        }
    }

    if let Some(home) = env_dir("USERPROFILE") {
        for root in [
            home.join("curseforge").join("minecraft").join("Instances"),
            home.join("Documents")
                .join("curseforge")
                .join("minecraft")
                .join("Instances"),
        ] {
            scan_curse_root(&root, &imported, &mut seen, &mut out);
        }
    }

    out
}

fn scan_prism_root(
    root: &Path,
    source: &str,
    launcher: &str,
    imported: &HashSet<String>,
    seen: &mut HashSet<String>,
    out: &mut LauncherScan,
) {
    if !root.is_dir() {
        return;
    }
    let dirs = match child_dirs(root) {
        Ok(dirs) => dirs,
        Err(e) => {
            out.warnings.push(format!("{launcher}: {e}"));
            return;
        }
    };
    let mut count = 0usize;
    for dir in dirs {
        if !seen.insert(normalize_path(&dir)) {
            continue;
        }
        let detected = prism_detected(&dir);
        out.instances
            .push(found(&dir, source, launcher, detected, imported));
        count += 1;
    }
    if count > 0 {
        out.launchers.push(LauncherInfo {
            source: source.into(),
            name: launcher.into(),
            path: root.to_string_lossy().to_string(),
            instances: count,
        });
    }
}

fn scan_modrinth_root(
    root: &Path,
    imported: &HashSet<String>,
    seen: &mut HashSet<String>,
    out: &mut LauncherScan,
) {
    if !root.is_dir() {
        return;
    }
    let dirs = match child_dirs(root) {
        Ok(dirs) => dirs,
        Err(e) => {
            out.warnings.push(format!("Modrinth App: {e}"));
            return;
        }
    };
    let mut count = 0usize;
    for dir in dirs {
        if !seen.insert(normalize_path(&dir)) {
            continue;
        }
        let detected = modrinth_detected(&dir);
        out.instances
            .push(found(&dir, "modrinth", "Modrinth App", detected, imported));
        count += 1;
    }
    if count > 0 {
        out.launchers.push(LauncherInfo {
            source: "modrinth".into(),
            name: "Modrinth App".into(),
            path: root.to_string_lossy().to_string(),
            instances: count,
        });
    }
}

fn scan_curse_root(
    root: &Path,
    imported: &HashSet<String>,
    seen: &mut HashSet<String>,
    out: &mut LauncherScan,
) {
    if !root.is_dir() {
        return;
    }
    let dirs = match child_dirs(root) {
        Ok(dirs) => dirs,
        Err(e) => {
            out.warnings.push(format!("CurseForge: {e}"));
            return;
        }
    };
    let mut count = 0usize;
    for dir in dirs {
        if !seen.insert(normalize_path(&dir)) {
            continue;
        }
        let detected = curse_detected(&dir);
        out.instances
            .push(found(&dir, "curseforge", "CurseForge", detected, imported));
        count += 1;
    }
    if count > 0 {
        out.launchers.push(LauncherInfo {
            source: "curseforge".into(),
            name: "CurseForge".into(),
            path: root.to_string_lossy().to_string(),
            instances: count,
        });
    }
}

// --------------------------------------------------------------- inspect

pub fn inspect_folder(path: &Path) -> Result<FoundInstance, String> {
    if !path.is_dir() {
        return Err(format!("Папка не найдена: {}", path.display()));
    }
    let imported = imported_sources();
    let (source, launcher, detected) = describe(path);
    Ok(found(path, source, launcher, detected, &imported))
}

fn describe(path: &Path) -> (&'static str, &'static str, Detected) {
    match detect_kind(path) {
        Kind::Prism => ("prism", "Prism Launcher", prism_detected(path)),
        Kind::Modrinth => ("modrinth", "Modrinth App", modrinth_detected(path)),
        Kind::Curse => ("curseforge", "CurseForge", curse_detected(path)),
        Kind::Minecraft => (
            "minecraft",
            "Minecraft / TLauncher",
            minecraft_detected(path),
        ),
    }
}

fn detect_kind(path: &Path) -> Kind {
    if path.join("instance.cfg").is_file() || path.join("mmc-pack.json").is_file() {
        return Kind::Prism;
    }
    if path.join("profile.json").is_file() {
        return Kind::Modrinth;
    }
    if path.join("minecraftinstance.json").is_file() {
        return Kind::Curse;
    }
    Kind::Minecraft
}

fn found(
    path: &Path,
    source: &str,
    launcher: &str,
    detected: Detected,
    imported: &HashSet<String>,
) -> FoundInstance {
    let path_text = path.to_string_lossy().to_string();
    FoundInstance {
        id: format!("{source}:{path_text}"),
        source: source.to_string(),
        launcher: launcher.to_string(),
        name: detected.name,
        mc_version: detected.mc_version,
        loader: detected.loader,
        loader_version: detected.loader_version,
        icon: detected.icon,
        mods: count_mods(&detected.content),
        worlds: count_worlds(&detected.content),
        size_bytes: dir_size(&detected.content),
        already_imported: imported.contains(&normalize_path(path)),
        path: path_text,
    }
}

// ------------------------------------------------------------- detection

fn prism_detected(path: &Path) -> Detected {
    let cfg = parse_ini(&path.join("instance.cfg"));
    let content = prism_content(path, &cfg);
    let name = cfg
        .get("name")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| folder_name(path));

    let (mut mc, mut loader, mut loader_version) = read_mmc_pack(&path.join("mmc-pack.json"));
    if mc.is_empty() || loader == "vanilla" {
        let (found_mc, found_loader, found_version) = detect_versions(&content);
        if mc.is_empty() {
            mc = found_mc;
        }
        if loader == "vanilla" && found_loader != "vanilla" {
            loader = found_loader;
            loader_version = found_version;
        }
    }

    Detected {
        content,
        name,
        mc_version: mc,
        loader,
        loader_version,
        icon: None,
    }
}

fn prism_content(instance: &Path, cfg: &HashMap<String, String>) -> PathBuf {
    if let Some(dir) = cfg
        .get("OverrideGameDir")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(dir);
        return if path.is_absolute() {
            path
        } else {
            instance.join(path)
        };
    }
    let dot = instance.join(".minecraft");
    if dot.is_dir() {
        return dot;
    }
    let mc = instance.join("minecraft");
    if mc.is_dir() {
        return mc;
    }
    // Иногда путь уже указывает на игровой каталог (импорт вручную).
    if instance.join("versions").is_dir()
        || instance.join("saves").is_dir()
        || instance.join("mods").is_dir()
    {
        return instance.to_path_buf();
    }
    dot
}

fn read_mmc_pack(path: &Path) -> (String, String, Option<String>) {
    let mut mc = String::new();
    let mut loader = "vanilla".to_string();
    let mut loader_version: Option<String> = None;
    let Some(value) = read_json(path) else {
        return (mc, loader, loader_version);
    };
    let components = value
        .get("components")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();
    for component in components {
        let uid = component
            .get("uid")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let version = component
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if version.trim().is_empty() {
            continue;
        }
        match uid {
            "net.minecraft" => mc = version.trim().to_string(),
            "net.fabricmc.fabric-loader" => {
                loader = "fabric".into();
                loader_version = Some(version.trim().to_string());
            }
            "org.quiltmc.quilt-loader" => {
                loader = "quilt".into();
                loader_version = Some(version.trim().to_string());
            }
            "net.minecraftforge" => {
                loader = "forge".into();
                loader_version = Some(version.trim().to_string());
            }
            "net.neoforged" => {
                loader = "neoforge".into();
                loader_version = Some(version.trim().to_string());
            }
            _ => {}
        }
    }
    (mc, loader, loader_version)
}

fn modrinth_detected(path: &Path) -> Detected {
    let value = read_json(&path.join("profile.json"));
    let name = value
        .as_ref()
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| folder_name(path));
    let mc_version = value
        .as_ref()
        .and_then(|v| v.get("game_version"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let loader = value
        .as_ref()
        .and_then(|v| v.get("loader"))
        .and_then(|v| v.as_str())
        .map(normalize_loader)
        .unwrap_or_else(|| "vanilla".to_string());
    let loader_version = value
        .as_ref()
        .and_then(|v| v.get("loader_version"))
        .and_then(value_string);
    let icon = value
        .as_ref()
        .and_then(|v| v.get("icon"))
        .and_then(value_string)
        .map(|icon| resolve_icon(path, &icon));

    Detected {
        content: path.to_path_buf(),
        name,
        mc_version,
        loader,
        loader_version,
        icon,
    }
}

fn curse_detected(path: &Path) -> Detected {
    let value = read_json(&path.join("minecraftinstance.json"));
    let name = value
        .as_ref()
        .and_then(|v| v.pointer("/installedModpack/name"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            value
                .as_ref()
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| folder_name(path));
    let mc_version = value
        .as_ref()
        .and_then(|v| v.get("gameVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let loader_name = value
        .as_ref()
        .and_then(|v| v.pointer("/baseModLoader/name"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let (loader, loader_version) = loader_from_id(loader_name);

    Detected {
        content: path.to_path_buf(),
        name,
        mc_version,
        loader,
        loader_version,
        icon: None,
    }
}

fn minecraft_detected(path: &Path) -> Detected {
    let (mc_version, loader, loader_version) = detect_versions(path);
    let name = launcher_profile_name(path).unwrap_or_else(|| "Minecraft".to_string());
    Detected {
        content: path.to_path_buf(),
        name,
        mc_version,
        loader,
        loader_version,
        icon: None,
    }
}

/// Имя выбранного профиля из `launcher_profiles.json` (если файл читается).
fn launcher_profile_name(content: &Path) -> Option<String> {
    let value = read_json(&content.join("launcher_profiles.json"))?;
    let selected = value
        .get("selectedProfile")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())?;
    value
        .get("profiles")
        .and_then(|p| p.get(selected))
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// (приоритет, ключ версии, версия MC, загрузчик, версия загрузчика)
type VersionCandidate = (u8, Vec<u64>, String, String, Option<String>);

/// Загрузчик и версия MC по именам папок `versions/`.
fn detect_versions(content: &Path) -> (String, String, Option<String>) {
    let Ok(entries) = std::fs::read_dir(content.join("versions")) else {
        return (String::new(), "vanilla".to_string(), None);
    };
    let mut best: Option<VersionCandidate> = None;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let Some((score, mc, loader, version)) = parse_version_id(&id) else {
            continue;
        };
        let key = version_key(&mc);
        let better = match &best {
            None => true,
            Some((best_score, best_key, ..)) => {
                score > *best_score || (score == *best_score && key > best_key.clone())
            }
        };
        if better {
            best = Some((score, key, mc, loader, version));
        }
    }
    match best {
        Some((_, _, mc, loader, version)) => (mc, loader, version),
        None => (String::new(), "vanilla".to_string(), None),
    }
}

/// `fabric-loader-<lv>-<mc>`, `forge-<mc>-<lv>`, `neoforge-...`, `<mc>`.
fn parse_version_id(id: &str) -> Option<(u8, String, String, Option<String>)> {
    let lower = id.to_lowercase();
    if let Some(rest) = lower.strip_prefix("fabric-loader-") {
        return split_loader_id(rest, "fabric");
    }
    if let Some(rest) = lower.strip_prefix("quilt-loader-") {
        return split_loader_id(rest, "quilt");
    }
    if let Some(rest) = lower.strip_prefix("neoforge-") {
        if let Some((mc, version)) = rest.split_once('-') {
            if is_mc_version(mc) {
                return Some((
                    4,
                    mc.to_string(),
                    "neoforge".into(),
                    Some(version.to_string()),
                ));
            }
        }
        return Some((4, String::new(), "neoforge".into(), Some(rest.to_string())));
    }
    if let Some(rest) = lower.strip_prefix("forge-") {
        if let Some((mc, version)) = rest.split_once('-') {
            return Some((4, mc.to_string(), "forge".into(), Some(version.to_string())));
        }
        if is_mc_version(rest) {
            return Some((1, rest.to_string(), "vanilla".into(), None));
        }
        return Some((4, String::new(), "forge".into(), Some(rest.to_string())));
    }
    if is_mc_version(&lower) {
        return Some((1, lower, "vanilla".into(), None));
    }
    None
}

fn split_loader_id(rest: &str, loader: &str) -> Option<(u8, String, String, Option<String>)> {
    let (version, mc) = rest.rsplit_once('-')?;
    if version.is_empty() || mc.is_empty() {
        return None;
    }
    Some((
        4,
        mc.to_string(),
        loader.to_string(),
        Some(version.to_string()),
    ))
}

fn is_mc_version(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .next()
            .map(|c| c.is_ascii_digit())
            .unwrap_or(false)
        && value.contains('.')
        && value
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == '_')
}

fn version_key(version: &str) -> Vec<u64> {
    let mut out = Vec::new();
    for part in version.split(|c: char| !c.is_ascii_digit()) {
        if !part.is_empty() {
            if let Ok(number) = part.parse::<u64>() {
                out.push(number);
            }
        }
    }
    out
}

fn normalize_loader(loader: &str) -> String {
    let lower = loader.trim().to_lowercase();
    if lower.contains("quilt") {
        "quilt".into()
    } else if lower.contains("neoforge") {
        "neoforge".into()
    } else if lower.contains("forge") {
        "forge".into()
    } else if lower.contains("fabric") {
        "fabric".into()
    } else if lower.is_empty() {
        "vanilla".into()
    } else {
        lower
    }
}

fn loader_from_id(id: &str) -> (String, Option<String>) {
    let Some((prefix, version)) = id.split_once('-') else {
        return ("vanilla".to_string(), None);
    };
    let loader = normalize_loader(prefix);
    if loader == "vanilla" {
        return (loader, None);
    }
    let version = version.trim();
    (
        loader,
        if version.is_empty() {
            None
        } else {
            Some(version.to_string())
        },
    )
}

/// `loader_version` в Modrinth бывает строкой или объектом `{ "id": ... }`.
fn value_string(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return if text.is_empty() {
            None
        } else {
            Some(text.to_string())
        };
    }
    if value.is_object() {
        return value
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
    }
    None
}

fn resolve_icon(profile: &Path, icon: &str) -> String {
    if icon.starts_with("http://") || icon.starts_with("https://") {
        return icon.to_string();
    }
    let path = PathBuf::from(icon);
    let candidate = if path.is_absolute() {
        path
    } else {
        profile.join(path)
    };
    if candidate.is_file() {
        candidate.to_string_lossy().to_string()
    } else {
        icon.to_string()
    }
}

// ---------------------------------------------------------------- import

pub fn import(app: &AppHandle, items: &[ImportItem], task: &TaskHandle) -> ImportSummary {
    let _ = app;
    let cfg = store::load_config();
    task.set_total(items.len() as u64);
    let mut summary = ImportSummary {
        imported: Vec::new(),
        skipped: 0,
        errors: Vec::new(),
    };
    for item in items {
        match import_one(&cfg, item, task) {
            Ok((result, skipped)) => {
                summary.skipped += skipped;
                summary.imported.push(result);
            }
            Err(error) => summary.errors.push(error),
        }
        task.add(1);
    }
    summary
}

fn import_one(
    cfg: &Config,
    item: &ImportItem,
    task: &TaskHandle,
) -> Result<(ImportResult, usize), String> {
    let source_path = PathBuf::from(item.path.trim());
    if !source_path.is_dir() {
        return Err(format!("Папка не найдена: {}", source_path.display()));
    }
    let kind = match item.source.as_str() {
        "prism" | "multimc" => Kind::Prism,
        "modrinth" => Kind::Modrinth,
        "curseforge" => Kind::Curse,
        _ => detect_kind(&source_path),
    };
    let detected = match kind {
        Kind::Prism => prism_detected(&source_path),
        Kind::Modrinth => modrinth_detected(&source_path),
        Kind::Curse => curse_detected(&source_path),
        Kind::Minecraft => minecraft_detected(&source_path),
    };

    let name = item
        .name
        .clone()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| detected.name.clone());
    let name = instances::unique_name(&name);
    task.detail(format!("Копируем «{name}»"));

    let mc_version = item
        .mc_version
        .clone()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| detected.mc_version.clone());
    let mc_version = if mc_version.is_empty() {
        "1.20.1".to_string()
    } else {
        mc_version
    };
    let loader = item
        .loader
        .clone()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| detected.loader.clone());
    let loader = if loader.is_empty() {
        "vanilla".to_string()
    } else {
        loader
    };
    let loader_version = item
        .loader_version
        .clone()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| detected.loader_version.clone());

    instances::create(
        &name,
        &mc_version,
        &loader,
        loader_version,
        "▣",
        cfg.default_ram_mb,
        Vec::new(),
    )?;
    if let Some(mut meta) = instances::load(&name) {
        meta.import_source = source_path.to_string_lossy().to_string();
        meta.auto_backup = true;
        let _ = instances::save(&meta);
    }

    let dest = paths::game_dir(&name);
    std::fs::create_dir_all(&dest).map_err(|e| format!("Папка сборки: {e}"))?;

    let mut copied = 0usize;
    let mut skipped: Vec<String> = Vec::new();
    for sub in COPY_DIRS {
        copy_tree(
            &detected.content.join(sub),
            &dest.join(sub),
            &mut copied,
            &mut skipped,
        );
    }
    for file in COPY_FILES {
        let source = detected.content.join(file);
        if !source.is_file() {
            continue;
        }
        match std::fs::copy(&source, dest.join(file)) {
            Ok(_) => copied += 1,
            Err(_) => push_skipped(&mut skipped, file),
        }
    }

    let meta = instances::load(&name).ok_or_else(|| format!("Сборка «{name}» не сохранилась"))?;
    let skipped_count = skipped.len();
    Ok((
        ImportResult {
            instance: meta,
            installed_files: copied,
            skipped,
        },
        skipped_count,
    ))
}

fn copy_tree(src: &Path, dest: &Path, copied: &mut usize, skipped: &mut Vec<String>) {
    if !src.is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(src) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if kind.is_dir() {
            if let Err(error) = std::fs::create_dir_all(&target) {
                push_skipped(skipped, &format!("{}: {error}", target.display()));
                continue;
            }
            copy_tree(&path, &target, copied, skipped);
        } else if kind.is_file() {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::copy(&path, &target) {
                Ok(_) => *copied += 1,
                Err(_) => push_skipped(skipped, &path.to_string_lossy()),
            }
        }
    }
}

fn push_skipped(skipped: &mut Vec<String>, value: &str) {
    if skipped.len() < MAX_SKIPPED {
        skipped.push(value.to_string());
    }
}

// ----------------------------------------------------------------- counts

fn count_mods(content: &Path) -> usize {
    fn walk(dir: &Path, depth: u8) -> usize {
        if depth > 3 {
            return 0;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return 0;
        };
        let mut count = 0usize;
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                count += walk(&entry.path(), depth + 1);
            } else if kind.is_file() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.ends_with(".jar") || name.ends_with(".jar.disabled") {
                    count += 1;
                }
            }
        }
        count
    }
    walk(&content.join("mods"), 0)
}

fn count_worlds(content: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(content.join("saves")) else {
        return 0;
    };
    entries.flatten().filter(|e| e.path().is_dir()).count()
}

fn dir_size(root: &Path) -> u64 {
    let mut entries = 0usize;
    let mut total = 0u64;
    walk_size(root, true, &mut entries, &mut total);
    total
}

fn walk_size(dir: &Path, is_root: bool, entries: &mut usize, total: &mut u64) {
    if *entries >= ENTRY_LIMIT || *total >= SIZE_LIMIT {
        return;
    }
    let Ok(reader) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in reader.flatten() {
        if *entries >= ENTRY_LIMIT || *total >= SIZE_LIMIT {
            return;
        }
        *entries += 1;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if is_root && SKIP_SIZE_DIRS.contains(&name.as_str()) {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            walk_size(&entry.path(), false, entries, total);
        } else if kind.is_file() {
            if let Ok(meta) = entry.metadata() {
                *total = total.saturating_add(meta.len());
            }
        }
    }
}

// ----------------------------------------------------------------- helpers

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
}

fn child_dirs(root: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = std::fs::read_dir(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let mut out: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    out.sort();
    Ok(out)
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Сборка".to_string())
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .to_lowercase()
        .trim_end_matches('\\')
        .to_string()
}

/// Пути-источники уже импортированных сборок.
fn imported_sources() -> HashSet<String> {
    let mut out = HashSet::new();
    let Ok(entries) = std::fs::read_dir(paths::instances_dir()) else {
        return out;
    };
    for entry in entries.flatten() {
        let folder = entry.file_name().to_string_lossy().to_string();
        if let Some(meta) = instances::load(&folder) {
            let source = meta.import_source.trim();
            if !source.is_empty() {
                out.insert(normalize_path(Path::new(source)));
            }
        }
    }
    out
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Простейший INI: `key=value`, строки с `#`/`;` игнорируются.
fn parse_ini(path: &Path) -> HashMap<String, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    let mut out = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            out.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    out
}
