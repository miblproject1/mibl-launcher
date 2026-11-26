//! Все пути лаунчера. Полная совместимость с Python-версией:
//! `%APPDATA%\MiblLauncher\...`

use std::path::{Path, PathBuf};

pub const APP_NAME: &str = "MiblLauncher";

/// Минимальный валидный профиль лаунчера, который ожидают установщики Forge/NeoForge.
pub const LAUNCHER_PROFILES_JSON: &str = r#"{"profiles":{},"selectedProfile":""}"#;

/// Гарантировать наличие `launcher_profiles.json` в указанной папке.
///
/// Официальные установщики Forge и NeoForge завершаются с ошибкой
/// «There is no minecraft launcher profile in ... you need to run the launcher first!»,
/// если файла нет. Повреждённый/пустой файл тоже перезаписываем.
pub fn ensure_launcher_profiles(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let file = dir.join("launcher_profiles.json");
    let valid = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .map(|value| {
            value.get("profiles").map(|p| p.is_object()).unwrap_or(false)
        })
        .unwrap_or(false);
    if !valid {
        std::fs::write(&file, LAUNCHER_PROFILES_JSON)?;
    }
    Ok(())
}

/// Возвращает путь к директории данных лаунчера.
/// Сначала проверяет переменную окружения MIBL_LAUNCHER_DIR, 
/// если не задана - использует APPDATA.
pub fn data_dir() -> PathBuf {
    // Проверяем, задана ли пользовательская директория
    if let Ok(custom_dir) = std::env::var("MIBL_LAUNCHER_DIR") {
        let custom_path = PathBuf::from(custom_dir);
        // Создаем путь к каталогу данных внутри указанной директории
        let dir = custom_path.join(APP_NAME);
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    
    // Если пользовательская директория не задана, используем стандартную
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            // APPDATA задан практически всегда, но не оставляем шанса писать рядом с .exe.
            std::env::var_os("USERPROFILE")
                .map(PathBuf::from)
                .map(|home| home.join("AppData").join("Roaming"))
        })
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join(APP_NAME);
    let legacy = base.join("MCLite");
    if !dir.exists() && legacy.is_dir() {
        let _ = std::fs::rename(&legacy, &dir);
    }
    let _ = std::fs::create_dir_all(&dir);
    // Базовая папка должна быть готова к официальным установщикам Forge/NeoForge.
    let _ = ensure_launcher_profiles(&dir);
    dir
}

/// Подкаталог данных (создаётся по требованию).
pub fn sub(name: &str) -> PathBuf {
    let p = data_dir().join(name);
    let _ = std::fs::create_dir_all(&p);
    p
}

pub fn versions_dir() -> PathBuf {
    sub("versions")
}

pub fn libraries_dir() -> PathBuf {
    sub("libraries")
}

pub fn assets_dir() -> PathBuf {
    sub("assets")
}

pub fn runtime_dir() -> PathBuf {
    sub("runtime")
}

pub fn natives_dir() -> PathBuf {
    sub("natives")
}

pub fn instances_dir() -> PathBuf {
    sub("instances")
}

pub fn skins_dir() -> PathBuf {
    sub("skins")
}

pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn accounts_path() -> PathBuf {
    data_dir().join("accounts.json")
}

pub fn theme_path() -> PathBuf {
    data_dir().join("theme.json")
}

pub fn instance_dir(name: &str) -> PathBuf {
    instances_dir().join(safe_name(name))
}

pub fn game_dir(name: &str) -> PathBuf {
    instance_dir(name).join("minecraft")
}

pub fn instance_meta_path(name: &str) -> PathBuf {
    instance_dir(name).join("instance.json")
}

/// Глобальная папка бэкапов: `%APPDATA%\MiblLauncher\backups\<имя_сборки>`.
///
/// Каталог создаётся вызывающим кодом по требованию.
pub fn backups_root(instance: &str) -> PathBuf {
    data_dir().join("backups").join(safe_name(instance))
}

/// Замена запрещённых для Windows символов (как `safe_name` в Python).
pub fn safe_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        let bad = matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            || (ch as u32) < 0x20;
        out.push(if bad { '_' } else { ch });
    }
    let trimmed = out.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "instance".to_string()
    } else {
        trimmed
    }
}

/// Относительный путь внутри каталога (для UI).
pub fn rel(path: &std::path::Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
