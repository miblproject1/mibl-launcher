//! Автоматический подбор и загрузка Java под версию Minecraft.
//!
//! - Minecraft 1.16.5 и ниже — Java 8;
//! - 1.17 – 1.20.4 — Java 17;
//! - 1.20.5 – 1.21.* — Java 21;
//! - Minecraft 26.* и новее — Java 25.
//!
//! Если в JSON-манифесте версии есть `javaVersion.majorVersion`, он имеет
//! приоритет над определением по названию версии.
//!
//! Сначала ищем подходящую Java в рантаймах лаунчера, затем в пути из
//! настроек и стандартных каталогах Windows. Если ничего не нашли —
//! скачиваем портативный Eclipse Temurin JRE с API Adoptium и распаковываем
//! его в `<app_data>/runtime/java-{major}`.
//!
//! Важно: системный `PATH` никогда не используется напрямую. Ярлыки из
//! `Common Files\Oracle\Java\javapath` часто сломаны и дают ошибки
//! «could not find java.dll» / «Could not find Java SE Runtime Environment»,
//! поэтому каждый кандидат проверяется по-настоящему.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::http;
use crate::paths;
use crate::store;
use crate::tasks::TaskHandle;

const ADOPTIUM_BINARY: &str = "https://api.adoptium.net/v3/binary/latest";
const ADOPTIUM_LATEST: &str = "https://api.adoptium.net/v3/assets/latest";

/// Требуемая мажорная версия Java для версии Minecraft.
///
/// Это запасное определение по названию версии. Если в манифесте есть
/// `javaVersion.majorVersion`, используйте [`required_major_for`].
pub fn required_major(mc_version: &str) -> u32 {
    let cleaned = mc_version.trim().trim_start_matches('v');
    // Новая схема версий: 26.*, 26w14a и далее требуют Java 25.
    if cleaned.starts_with("26.") || cleaned.starts_with("26w") {
        return 25;
    }
    let Some((major, minor, patch)) = parse_version(cleaned) else {
        // Неизвестный формат (например, снапшот) — современная Java.
        return 21;
    };
    if major >= 26 {
        // Новые схемы версий Minecraft (26.x и т.п.).
        return 25;
    }
    if minor < 17 {
        8
    } else if minor < 20 || (minor == 20 && patch <= 4) {
        17
    } else {
        21
    }
}

/// Мажорная версия Java из JSON-манифеста версии (`javaVersion.majorVersion`).
pub fn manifest_java_major(vjson: &Value) -> Option<u32> {
    let value = vjson
        .get("javaVersion")
        .and_then(|java| java.get("majorVersion"))?;
    if let Some(number) = value.as_u64() {
        return u32::try_from(number).ok();
    }
    value
        .as_str()
        .and_then(|text| text.trim().parse::<u32>().ok())
}

/// Мажорная версия Java: сначала манифест версии, затем название Minecraft.
pub fn required_major_for(manifest: Option<&Value>, mc_version: &str) -> u32 {
    manifest
        .and_then(manifest_java_major)
        .unwrap_or_else(|| required_major(mc_version))
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

/// Команда без окна консоли (лаунчер — GUI-приложение).
fn hidden_command(path: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(crate::proc::CREATE_NO_WINDOW);
    }
    cmd
}

/// Строгая проверка исполняемого файла Java.
///
/// Проверяем, что это настоящий Windows-рантайм, а не сломанный ярлык:
/// рядом с `java.exe` должны лежать `java.dll` и `server/jvm.dll` (или
/// `client/jvm.dll`), а пробный запуск `java -version` завершается с кодом 0.
pub fn is_valid_java(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(windows)]
    {
        let Some(bin) = path.parent() else {
            return false;
        };
        if !bin.join("java.dll").is_file() {
            return false;
        }
        let jvm = bin.join("server").join("jvm.dll");
        let client = bin.join("client").join("jvm.dll");
        if !jvm.is_file() && !client.is_file() {
            return false;
        }
    }

    let mut cmd = hidden_command(path);
    cmd.arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    matches!(cmd.status(), Ok(status) if status.success())
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

/// Мажорная версия по выводу `java -version` (для рантаймов без `release`).
fn version_output_major(java: &Path) -> Option<u32> {
    let output = hidden_command(java).arg("-version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let mut text = String::from_utf8_lossy(&output.stderr).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    let quoted: Vec<&str> = text.split('"').collect();
    for part in quoted.iter().skip(1).step_by(2) {
        if let Some(major) = major_from_text(part) {
            return Some(major);
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
        (
            25,
            &["jdk-25", "jre-25", "temurin-25", "temurin25", "zulu25", "java-25"],
        ),
    ];
    for (major, needles) in HINTS {
        if needles.iter().any(|needle| text.contains(needle)) {
            return Some(*major);
        }
    }

    // Последний резерв: спросить у самой JVM.
    version_output_major(java)
}

fn find_java_under(root: &Path, major: u32, depth: u8) -> Option<String> {
    if !root.is_dir() {
        return None;
    }
    let direct = root.join("bin").join("java.exe");
    if direct.is_file() && java_major_of(&direct) == Some(major) && is_valid_java(&direct) {
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

/// Стандартные каталоги установки Java на Windows.
fn install_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(base) = std::env::var_os("ProgramFiles") {
        let base = PathBuf::from(base);
        for name in [
            "Java",
            "Eclipse Adoptium",
            "Microsoft",
            "BellSoft",
            "Zulu",
            "Amazon Corretto",
            "Semeru",
        ] {
            roots.push(base.join(name));
        }
    }
    if let Some(base) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(base).join("Java"));
    }
    if let Some(base) = std::env::var_os("LOCALAPPDATA") {
        let programs = PathBuf::from(base).join("Programs");
        for name in [
            "Eclipse Adoptium",
            "Java",
            "BellSoft",
            "Zulu",
            "Microsoft",
        ] {
            roots.push(programs.join(name));
        }
    }
    roots
}

/// Рантаймы официального Minecraft Launcher и Modrinth App.
fn launcher_java_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(base) = std::env::var_os("APPDATA") {
        let appdata = PathBuf::from(base);
        // Официальный лаунчер (новая версия ставит Java в .minecraft/runtime).
        roots.push(appdata.join(".minecraft").join("runtime"));
        // Modrinth App (Theseus).
        roots.push(
            appdata
                .join("com.modrinth.theseus")
                .join("meta")
                .join("java_versions"),
        );
        roots.push(appdata.join("com.modrinth.theseus").join("java"));
        roots.push(appdata.join("ModrinthApp").join("runtime"));
        roots.push(appdata.join("ModrinthApp").join("java"));
    }

    if let Some(base) = std::env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(base);
        // Официальный лаунчер из Microsoft Store.
        let package = local
            .join("Packages")
            .join("Microsoft.4297127D64EC6_8wekyb3d8bbwe")
            .join("LocalCache");
        roots.push(package.join("Local").join("runtime"));
        roots.push(package.join("Roaming").join(".minecraft").join("runtime"));
        // Modrinth App в LocalAppData.
        roots.push(
            local
                .join("com.modrinth.theseus")
                .join("meta")
                .join("java_versions"),
        );
        roots.push(local.join("ModrinthApp").join("runtime"));
        roots.push(local.join("Programs").join("ModrinthApp").join("runtime"));
    }

    roots
}

fn valid_java(path: &Path, major: u32) -> Option<String> {
    if !path.is_absolute() || !path.is_file() || java_major_of(path) != Some(major) {
        return None;
    }
    if !is_valid_java(path) {
        return None;
    }
    Some(path.to_string_lossy().to_string())
}

/// Ярлыки Oracle javapath пропускаем: они часто ведут на удалённый JRE.
fn is_broken_javapath(dir: &Path) -> bool {
    let text = dir.to_string_lossy().to_lowercase().replace('/', "\\");
    text.contains("common files\\oracle\\java\\javapath")
}

fn find_in_path(major: u32) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        if is_broken_javapath(&dir) {
            continue;
        }
        let candidate = dir.join("java.exe");
        if candidate.is_absolute()
            && candidate.is_file()
            && java_major_of(&candidate) == Some(major)
            && is_valid_java(&candidate)
        {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

/// Найти установленную Java нужной мажорной версии.
///
/// Порядок: рантаймы лаунчера → путь пользователя → стандартные каталоги
/// Windows → официальный лаунчер/Modrinth → JAVA_HOME → PATH.
pub fn find_installed_with(major: u32, preferred: Option<&Path>) -> Option<String> {
    let runtime = paths::runtime_dir();

    // 1. Портативные рантаймы лаунчера: runtime/java-{major}.
    for dir in [
        runtime.join(format!("java-{major}")),
        runtime.join(format!("temurin-{major}")),
        runtime.join(format!("temurin-jre-{major}")),
    ] {
        if let Some(found) = find_java_under(&dir, major, 3) {
            return Some(found);
        }
    }

    // Компоненты Mojang (jre-legacy, java-runtime-gamma и т.п.).
    if let Some(found) = find_java_under(&runtime, major, 4) {
        return Some(found);
    }

    // 2. Путь из настроек пользователя — только если он реально валиден.
    if let Some(path) = preferred {
        if let Some(found) = valid_java(path, major) {
            return Some(found);
        }
    }

    // 3. Стандартные каталоги установки Java.
    for root in install_roots() {
        if let Some(found) = find_java_under(&root, major, 2) {
            return Some(found);
        }
    }

    // 4. Рантаймы официального Minecraft Launcher и Modrinth App.
    for root in launcher_java_roots() {
        if let Some(found) = find_java_under(&root, major, 3) {
            return Some(found);
        }
    }

    // 5. JAVA_HOME.
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join("java.exe");
        if let Some(found) = valid_java(&candidate, major) {
            return Some(found);
        }
    }

    // 6. PATH — только абсолютные пути, прошедшие проверку.
    find_in_path(major)
}

/// Найти Java нужной версии с учётом глобальных настроек.
pub fn find_installed(major: u32) -> Option<String> {
    let config = store::load_config();
    let trimmed = config.java_path.trim();
    let preferred = if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    };
    find_installed_with(major, preferred.as_deref())
}

/// Найти Java нужной версии, при необходимости скачав Eclipse Temurin JRE.
///
/// `manifest` — JSON конкретной версии Minecraft: если в нём есть
/// `javaVersion.majorVersion`, он приоритетнее названия версии.
pub async fn ensure_java(
    mc_version: &str,
    manifest: Option<&Value>,
    preferred: Option<&Path>,
    task: Option<&TaskHandle>,
) -> Result<String, String> {
    let major = required_major_for(manifest, mc_version);
    ensure_major(major, preferred, task).await
}

/// Найти/скачать Java указанной мажорной версии (8, 17, 21, 25, …).
pub async fn ensure_major(
    major: u32,
    preferred: Option<&Path>,
    task: Option<&TaskHandle>,
) -> Result<String, String> {
    if let Some(found) = find_installed_with(major, preferred) {
        if let Some(t) = task {
            t.detail(format!("Java {major} найдена"));
        }
        return Ok(found);
    }

    if let Some(t) = task {
        if let Some(path) = preferred {
            if path.exists() {
                t.detail(format!(
                    "Java {major}: указанный путь не подходит, скачиваю Temurin"
                ));
            }
        }
    }

    download_temurin(major, task).await
}

/// Ссылка на официальный `.zip` из Adoptium API v3 (direct binary).
fn adoptium_binary_url(major: u32) -> String {
    format!("{ADOPTIUM_BINARY}/{major}/ga/windows/x64/jre/hotspot/normal/eclipse")
}

/// Резервная ссылка через assets API (на случай изменения редиректа).
async fn adoptium_asset_url(major: u32) -> Result<String, String> {
    let url = format!(
        "{ADOPTIUM_LATEST}/{major}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse"
    );
    let value = http::get_json(&url)
        .await
        .map_err(|e| format!("Adoptium: {e}"))?;
    pick_package(&value)
        .and_then(|package| package.get("link"))
        .and_then(|link| link.as_str())
        .filter(|link| !link.is_empty())
        .map(|link| link.to_string())
        .ok_or_else(|| format!("Adoptium: не найден JRE {major} для Windows x64"))
}

async fn download_temurin(major: u32, task: Option<&TaskHandle>) -> Result<String, String> {
    let dest_dir = paths::runtime_dir().join(format!("java-{major}"));
    let zip_path = paths::sub("cache").join(format!("temurin-jre-{major}.zip"));

    if let Some(t) = task {
        t.detail(format!("Скачивание Java {major} (Temurin JRE)"));
    }

    let url = adoptium_binary_url(major);
    let mut download = http::download_file_long(&url, &zip_path, None, task).await;
    if let Err(error) = download {
        eprintln!("[java] Adoptium direct: {error}");
        if let Some(t) = task {
            t.reset(0, format!("Поиск Java {major} (Adoptium API)"));
        }
        let link = adoptium_asset_url(major).await?;
        download = http::download_file_long(&link, &zip_path, None, task).await;
    }
    download?;

    if let Some(t) = task {
        t.detail(format!("Распаковка Java {major}"));
    }
    // Старая/битая установка не должна смешиваться с новой.
    let _ = std::fs::remove_dir_all(&dest_dir);
    extract_zip(&zip_path, &dest_dir, major, task)?;
    let _ = std::fs::remove_file(&zip_path);

    let found = find_java_under(&dest_dir, major, 4).ok_or_else(|| {
        format!(
            "Java {major} скачана, но файл java.exe не найден в {}",
            dest_dir.display()
        )
    })?;
    if !is_valid_java(Path::new(&found)) {
        return Err(format!(
            "Java {major} установлена, но не запускается: {found}"
        ));
    }

    if let Some(t) = task {
        t.detail(format!("Java {major} готова"));
    }
    Ok(found)
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

/// Верхняя папка архива (`jdk-17.0.9+9-jre/`), если она единственная.
fn single_root_prefix(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<String> {
    let mut root: Option<String> = None;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).ok()?;
        let name = entry.name().replace('\\', "/");
        let first = name.split('/').next()?.trim();
        if first.is_empty() {
            continue;
        }
        match &root {
            None => root = Some(first.to_string()),
            Some(existing) if existing == first => {}
            Some(_) => return None,
        }
    }
    root
}

/// Распаковать Temurin ZIP. Если внутри одна корневая папка — убираем её,
/// чтобы `java.exe` оказался в `runtime/java-{major}/bin/java.exe`.
fn extract_zip(
    zip_path: &Path,
    dest: &Path,
    major: u32,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("Java: папка {}: {e}", dest.display()))?;
    let file = std::fs::File::open(zip_path)
        .map_err(|e| format!("Java: архив {}: {e}", zip_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Java: ZIP {}: {e}", zip_path.display()))?;

    let root_prefix = single_root_prefix(&mut archive);
    let total = archive.len() as u64;
    if let Some(t) = task {
        t.reset(total, format!("Распаковка Java {major}"));
    }

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("Java: запись {index}: {e}"))?;
        let raw_name = entry.name().replace('\\', "/");
        let relative_name = match root_prefix.as_deref() {
            Some(root) => match raw_name.strip_prefix(root) {
                Some(rest) => rest.trim_start_matches('/').to_string(),
                None => {
                    if let Some(t) = task {
                        t.add(1);
                    }
                    continue;
                }
            },
            None => raw_name,
        };
        if relative_name.is_empty() {
            if let Some(t) = task {
                t.add(1);
            }
            continue;
        }

        let Some(relative) = safe_relative(&relative_name) else {
            if let Some(t) = task {
                t.add(1);
            }
            continue;
        };
        let target = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            if let Some(t) = task {
                t.add(1);
            }
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out =
            std::fs::File::create(&target).map_err(|e| format!("Java: {}: {e}", target.display()))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Java: {}: {e}", target.display()))?;
        if let Some(t) = task {
            t.add(1);
        }
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
