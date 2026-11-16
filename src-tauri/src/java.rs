//! Автоматический подбор и загрузка Java под версию Minecraft.
//!
//! - Minecraft 1.16.5 и ниже — Java 8;
//! - 1.17 – 1.20.4 — Java 17;
//! - 1.20.5 и выше — Java 21.
//!
//! Сначала ищем подходящую Java в системе и в `runtime` лаунчера, затем
//! скачиваем портативный Eclipse Temurin JRE с API Adoptium.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::http;
use crate::paths;
use crate::tasks::TaskHandle;

const ADOPTIUM_LATEST: &str = "https://api.adoptium.net/v3/assets/latest";

/// Требуемая мажорная версия Java для версии Minecraft.
pub fn required_major(mc_version: &str) -> u32 {
    let Some((major, minor, patch)) = parse_version(mc_version) else {
        // Неизвестный формат (например, снапшот) — современная Java.
        return 17;
    };
    if major > 1 {
        // Новые схемы версий Minecraft (26.x и т.п.).
        return 21;
    }
    if minor < 17 {
        8
    } else if minor < 20 || (minor == 20 && patch <= 4) {
        17
    } else {
        21
    }
}

fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let cleaned = version.trim().trim_start_matches('v');
    let core = cleaned
        .split(|c: char| c == '-' || c == '+' || c == '_' || c.is_whitespace())
        .next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    Some((major, minor, patch))
}

/// Разобрать мажорную версию из строки вида `17.0.9`, `1.8.0_392`, `8u392`.
pub fn major_from_text(text: &str) -> Option<u32> {
    let cleaned = text.trim().trim_matches('"').trim();
    if cleaned.is_empty() {
        return None;
    }
    let first_digits: String = cleaned
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    let first = first_digits.parse::<u32>().ok()?;
    if first == 1 {
        let mut parts = cleaned.split('.');
        let _ = parts.next();
        let second = parts.next()?;
        let digits: String = second.chars().take_while(|c| c.is_ascii_digit()).collect();
        return digits.parse::<u32>().ok();
    }
    Some(first)
}

fn release_file_major(home: &Path) -> Option<u32> {
    let text = std::fs::read_to_string(home.join("release")).ok()?;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("JAVA_VERSION=") {
            return major_from_text(rest);
        }
    }
    None
}

/// Мажорная версия Java по пути к `java.exe`.
pub fn java_major_of(java: &Path) -> Option<u32> {
    if let Some(home) = java.parent().and_then(|bin| bin.parent()) {
        if let Some(major) = release_file_major(home) {
            return Some(major);
        }
    }

    // Резерв: определяем по названию каталога (jdk-17, jre1.8.0_401, jdk8u392…).
    let text = java.to_string_lossy().to_lowercase();
    const HINTS: &[(u32, &[&str])] = &[
        (
            8,
            &[
                "jdk8", "jre8", "jdk-8", "jre-8", "1.8", "temurin-8", "temurin8", "zulu8",
                "java-8",
            ],
        ),
        (
            17,
            &["jdk-17", "jre-17", "temurin-17", "temurin17", "zulu17", "java-17"],
        ),
        (
            21,
            &["jdk-21", "jre-21", "temurin-21", "temurin21", "zulu21", "java-21"],
        ),
    ];
    for (major, needles) in HINTS {
        if needles.iter().any(|needle| text.contains(needle)) {
            return Some(*major);
        }
    }
    None
}

fn find_java_under(root: &Path, major: u32, depth: u8) -> Option<String> {
    if !root.is_dir() {
        return None;
    }
    let direct = root.join("bin").join("java.exe");
    if direct.is_file() && java_major_of(&direct) == Some(major) {
        return Some(direct.to_string_lossy().to_string());
    }
    if depth == 0 {
        return None;
    }
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(root)
        .ok()?
        .flatten()
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_dir())
                .unwrap_or(false)
        })
        .map(|entry| entry.path())
        .collect();
    dirs.sort();
    for dir in dirs {
        if let Some(found) = find_java_under(&dir, major, depth - 1) {
            return Some(found);
        }
    }
    None
}

fn install_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(base) = std::env::var_os("ProgramFiles") {
        let base = PathBuf::from(base);
        for name in [
            "Java",
            "Eclipse Adoptium",
            "BellSoft",
            "Zulu",
            "Amazon Corretto",
        ] {
            roots.push(base.join(name));
        }
    }
    if let Some(base) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(base).join("Java"));
    }
    if let Some(base) = std::env::var_os("LOCALAPPDATA") {
        let programs = PathBuf::from(base).join("Programs");
        roots.push(programs.join("Eclipse Adoptium"));
        roots.push(programs.join("Java"));
    }
    roots
}

/// Найти установленную Java нужной мажорной версии.
pub fn find_installed(major: u32) -> Option<String> {
    // 1. Портативные рантаймы лаунчера (Mojang + Temurin).
    if let Some(found) = find_java_under(&paths::runtime_dir(), major, 4) {
        return Some(found);
    }

    // 2. JAVA_HOME.
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join("java.exe");
        if candidate.is_file() && java_major_of(&candidate) == Some(major) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    // 3. Стандартные каталоги установки Java на Windows.
    for root in install_roots() {
        if let Some(found) = find_java_under(&root, major, 2) {
            return Some(found);
        }
    }

    // 4. PATH.
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join("java.exe");
            if candidate.is_file() && java_major_of(&candidate) == Some(major) {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Найти Java нужной версии, при необходимости скачав Eclipse Temurin JRE.
pub async fn ensure_java(
    mc_version: &str,
    task: Option<&TaskHandle>,
) -> Result<String, String> {
    let major = required_major(mc_version);
    if let Some(found) = find_installed(major) {
        if let Some(t) = task {
            t.detail(format!("Java {major} найдена"));
        }
        return Ok(found);
    }
    download_temurin(major, task).await
}

async fn download_temurin(major: u32, task: Option<&TaskHandle>) -> Result<String, String> {
    let dest_dir = paths::runtime_dir().join(format!("temurin-{major}"));
    if let Some(found) = find_java_under(&dest_dir, major, 4) {
        return Ok(found);
    }

    if let Some(t) = task {
        t.detail(format!("Поиск Java {major} (Temurin)"));
    }
    let url = format!(
        "{ADOPTIUM_LATEST}/{major}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse"
    );
    let value = http::get_json(&url)
        .await
        .map_err(|e| format!("Adoptium: {e}"))?;
    let entry = pick_package(&value)
        .ok_or_else(|| format!("Adoptium: не найден JRE {major} для Windows x64"))?;
    let link = entry
        .get("link")
        .and_then(|v| v.as_str())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("Adoptium: нет ссылки на JRE {major}"))?;
    let filename = entry
        .get("name")
        .and_then(|v| v.as_str())
        .map(paths::safe_name)
        .unwrap_or_else(|| format!("temurin-{major}.zip"));
    let zip_path = paths::sub("cache").join(filename);

    if let Some(t) = task {
        t.detail(format!("Скачивание Java {major} (Temurin JRE)"));
    }
    http::download_file(link, &zip_path, None, task).await?;

    if let Some(t) = task {
        t.detail(format!("Распаковка Java {major}"));
    }
    let zip_for_task = zip_path.clone();
    let dest_for_task = dest_dir.clone();
    tokio::task::spawn_blocking(move || extract_zip(&zip_for_task, &dest_for_task))
        .await
        .map_err(|e| format!("Java: {e}"))??;
    let _ = std::fs::remove_file(&zip_path);

    find_java_under(&dest_dir, major, 4).ok_or_else(|| {
        format!("Java {major} скачана, но файл java.exe не найден в {}", dest_dir.display())
    })
}

fn pick_package(value: &Value) -> Option<&Value> {
    let list = value.as_array()?;
    list.iter()
        .find(|entry| {
            entry
                .get("binary")
                .and_then(|binary| binary.get("image_type"))
                .and_then(|kind| kind.as_str())
                .map(|kind| kind == "jre")
                .unwrap_or(false)
        })
        .or_else(|| list.first())
        .and_then(|entry| entry.get("binary"))
        .and_then(|binary| binary.get("package"))
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("Java: папка {}: {e}", dest.display()))?;
    let file = std::fs::File::open(zip_path)
        .map_err(|e| format!("Java: архив {}: {e}", zip_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Java: ZIP {}: {e}", zip_path.display()))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("Java: запись {index}: {e}"))?;
        let name = entry.name().to_string();
        let Some(relative) = safe_relative(&name) else {
            continue;
        };
        let target = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out =
            std::fs::File::create(&target).map_err(|e| format!("Java: {}: {e}", target.display()))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Java: {}: {e}", target.display()))?;
    }
    Ok(())
}

fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in Path::new(name).components() {
        match component {
            std::path::Component::Normal(part) => out.push(part),
            std::path::Component::CurDir => {}
            _ => return None,
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}
