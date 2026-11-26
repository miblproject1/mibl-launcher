//! Бэкапы миров сборки: отдельный архив на каждый мир + безопасное восстановление.
//!
//! Архивы лежат в `%APPDATA%\MiblLauncher\backups\<сборка>\<stamp>_<мир>.zip`,
//! первая запись — `mibl-backup.json` с метаданными. Формат совместим с 2.6+;
//! старые `worlds-<stamp>.zip` из папки сборки читаются как «легаси».

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::instances;
use crate::paths;

/// Имя служебной записи с метаданными архива.
pub const META_ENTRY: &str = "mibl-backup.json";
/// Версия формата бэкапа — пишется в метаданные.
pub const APP_VERSION: &str = "2.6.0";

/// Игра держит этот файл открытым — в архив он не попадает.
const LOCK_FILE: &str = "session.lock";
const MAX_SKIPPED: usize = 50;
const INVALID_PATH: &str = "Недопустимый путь архива";
const SHARING_MESSAGE: &str = "Закройте Minecraft и повторите — файлы мира заняты игрой";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct BackupMeta {
    pub app: String,
    pub version: String,
    pub instance: String,
    pub world: String,
    pub created: f64,
    pub automatic: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorldBackup {
    pub path: String,
    pub file_name: String,
    pub world: String,
    pub stamp: String,
    pub created: f64,
    pub size: u64,
    pub automatic: bool,
    pub legacy: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestoreResult {
    pub world: String,
    pub files: usize,
    pub previous_saved: Option<String>,
    pub skipped: Vec<String>,
}

/// Папка бэкапов сборки (создаётся по требованию вызывающим кодом).
pub fn root(instance: &str) -> PathBuf {
    paths::backups_root(instance)
}

pub fn list(instance: &str) -> Vec<WorldBackup> {
    let dir = root(instance);
    let mut out: Vec<WorldBackup> = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_zip(&path) {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let created = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let (mut stamp, mut world, mut legacy) = split_name(&stem);
        let mut automatic = false;
        if let Some(meta) = read_meta(&path) {
            automatic = meta.automatic;
            if !meta.world.trim().is_empty() {
                world = meta.world;
                legacy = false;
            }
        }
        if stamp.is_empty() {
            stamp = stem;
        }
        out.push(WorldBackup {
            path: path.to_string_lossy().to_string(),
            file_name,
            world,
            stamp,
            created,
            size,
            automatic,
            legacy,
        });
    }
    out.sort_by(|a, b| {
        b.created
            .partial_cmp(&a.created)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.stamp.cmp(&a.stamp))
    });
    out
}

/// Сохранить каждый мир отдельным архивом и применить ротацию.
pub fn backup_worlds(
    instance: &str,
    automatic: bool,
    keep: u32,
) -> Result<Vec<WorldBackup>, String> {
    let saves = paths::game_dir(instance).join("saves");
    if !saves.is_dir() {
        return Ok(Vec::new());
    }
    let mut worlds: Vec<(String, PathBuf)> = Vec::new();
    let entries = std::fs::read_dir(&saves).map_err(|e| format!("Папка миров: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            worlds.push((entry.file_name().to_string_lossy().to_string(), path));
        }
    }
    if worlds.is_empty() {
        return Ok(Vec::new());
    }
    worlds.sort_by(|a, b| a.0.cmp(&b.0));

    let dir = root(instance);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    let stamp = instances::timestamp();
    let mut created = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for (world, path) in &worlds {
        let base = short_name(world, 60);
        let mut dest = dir.join(format!("{stamp}_{base}.zip"));
        let mut n = 2;
        while dest.exists() {
            dest = dir.join(format!("{stamp}_{base}-{n}.zip"));
            n += 1;
        }
        match create_archive(&dest, instance, world, path, automatic) {
            Ok(0) => {
                // Мир без файлов (или только session.lock) — архив не нужен.
                let _ = std::fs::remove_file(&dest);
            }
            Ok(_) => created += 1,
            Err(e) => {
                let _ = std::fs::remove_file(&dest);
                errors.push(e);
            }
        }
    }

    rotate(instance, keep.clamp(3, 20));

    if created == 0 {
        if let Some(error) = errors.into_iter().next() {
            return Err(error);
        }
    }
    Ok(list(instance))
}

/// Восстановить мир из архива. Старый мир сохраняется рядом как `.restore-old-*`.
pub fn restore(instance: &str, zip_path: &Path) -> Result<RestoreResult, String> {
    let root_dir = root(instance);
    std::fs::create_dir_all(&root_dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    let root_canon = std::fs::canonicalize(&root_dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    let zip_canon = std::fs::canonicalize(zip_path).map_err(|_| INVALID_PATH.to_string())?;
    if !zip_canon.is_file() || !zip_canon.starts_with(&root_canon) || !is_zip(&zip_canon) {
        return Err(INVALID_PATH.into());
    }

    let file = std::fs::File::open(&zip_canon).map_err(|e| format!("Архив: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Повреждённый архив: {e}"))?;
    let meta = read_meta_from(&mut archive);
    let world = meta
        .as_ref()
        .map(|m| m.world.trim().to_string())
        .unwrap_or_default();

    let saves = paths::game_dir(instance).join("saves");
    std::fs::create_dir_all(&saves).map_err(|e| format!("Папка миров: {e}"))?;

    // Легаси-архив без мира: аккуратно раскладываем всё содержимое saves/.
    if world.is_empty() {
        let mut files = 0usize;
        let mut skipped: Vec<String> = Vec::new();
        extract(&mut archive, &saves, false, &mut files, &mut skipped)?;
        return Ok(RestoreResult {
            world: String::new(),
            files,
            previous_saved: None,
            skipped,
        });
    }

    let world_safe = paths::safe_name(&world);
    let stamp = instances::timestamp();
    let temp = saves.join(format!("{world_safe}.restoring-{stamp}"));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp).map_err(|e| format!("Временная папка: {e}"))?;

    let mut files = 0usize;
    let mut skipped: Vec<String> = Vec::new();
    if let Err(error) = extract(&mut archive, &temp, true, &mut files, &mut skipped) {
        let _ = std::fs::remove_dir_all(&temp);
        return Err(error);
    }
    if files == 0 {
        let _ = std::fs::remove_dir_all(&temp);
        return Err("В архиве нет файлов мира".into());
    }

    let target = saves.join(&world_safe);
    let mut previous: Option<String> = None;
    if target.exists() {
        let old_name = format!("{world_safe}.restore-old-{stamp}");
        let old = saves.join(&old_name);
        let _ = std::fs::remove_dir_all(&old);
        if let Err(error) = std::fs::rename(&target, &old) {
            let _ = std::fs::remove_dir_all(&temp);
            return Err(io_message(&error));
        }
        previous = Some(old_name);
    }
    if let Err(error) = std::fs::rename(&temp, &target) {
        let _ = std::fs::remove_dir_all(&temp);
        // Возвращаем старый мир на место, чтобы точно не потерять данные.
        if let Some(name) = &previous {
            let _ = std::fs::rename(saves.join(name), &target);
        }
        return Err(io_message(&error));
    }

    Ok(RestoreResult {
        world: world_safe,
        files,
        previous_saved: previous,
        skipped,
    })
}

/// Удалить архив мира. Разрешены только `.zip` внутри папки бэкапов сборки.
pub fn delete(instance: &str, zip_path: &Path) -> Result<(), String> {
    let root_dir = root(instance);
    std::fs::create_dir_all(&root_dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    let root_canon = std::fs::canonicalize(&root_dir).map_err(|e| format!("Папка бэкапов: {e}"))?;
    let zip_canon = std::fs::canonicalize(zip_path).map_err(|_| INVALID_PATH.to_string())?;
    if !zip_canon.is_file() || !zip_canon.starts_with(&root_canon) || !is_zip(&zip_canon) {
        return Err(INVALID_PATH.into());
    }
    std::fs::remove_file(&zip_canon).map_err(|e| format!("Удаление бэкапа: {e}"))
}

// ------------------------------------------------------------------ helpers

fn is_zip(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
}

fn is_sharing_violation(error: &std::io::Error) -> bool {
    // ERROR_SHARING_VIOLATION: файл занят другим процессом.
    error.raw_os_error() == Some(32)
}

fn io_message(error: &std::io::Error) -> String {
    if is_sharing_violation(error) {
        SHARING_MESSAGE.to_string()
    } else {
        format!("Восстановление мира: {error}")
    }
}

fn push_skipped(skipped: &mut Vec<String>, name: &str) {
    if skipped.len() < MAX_SKIPPED {
        skipped.push(name.to_string());
    }
}

/// `<stamp>_<мир>` или `worlds-<stamp>` → части имени файла архива.
fn split_name(stem: &str) -> (String, String, bool) {
    if let Some(rest) = stem.strip_prefix("worlds-") {
        return (rest.to_string(), String::new(), true);
    }
    if let Some((stamp, world)) = stem.split_once('_') {
        return (stamp.to_string(), trim_dedup(world), false);
    }
    (stem.to_string(), String::new(), false)
}

/// Снять суффикс `-2`/`-3`, добавленный при совпадении имён в одну секунду.
fn trim_dedup(world: &str) -> String {
    if let Some((base, tail)) = world.rsplit_once('-') {
        if base.chars().count() > 1 && !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit())
        {
            return base.to_string();
        }
    }
    world.to_string()
}

fn short_name(name: &str, max: usize) -> String {
    let safe = paths::safe_name(name);
    let trimmed: String = if safe.chars().count() <= max {
        safe
    } else {
        safe.chars().take(max).collect()
    };
    let trimmed = trimmed.trim().to_string();
    if trimmed.is_empty() {
        "world".to_string()
    } else {
        trimmed
    }
}

fn read_meta(path: &Path) -> Option<BackupMeta> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    read_meta_from(&mut archive)
}

fn read_meta_from(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<BackupMeta> {
    let mut entry = archive.by_name(META_ENTRY).ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    serde_json::from_str::<BackupMeta>(&text).ok()
}

fn create_archive(
    dest: &Path,
    instance: &str,
    world_name: &str,
    world_dir: &Path,
    automatic: bool,
) -> Result<usize, String> {
    let file =
        std::fs::File::create(dest).map_err(|e| format!("Архив мира «{world_name}»: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let meta = BackupMeta {
        app: "Mibl Launcher".into(),
        version: APP_VERSION.into(),
        instance: instance.to_string(),
        world: world_name.to_string(),
        created: instances::now(),
        automatic,
    };
    let text = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    zip.start_file(META_ENTRY, options)
        .map_err(|e| format!("Архив мира «{world_name}»: {e}"))?;
    zip.write_all(text.as_bytes())
        .map_err(|e| format!("Архив мира «{world_name}»: {e}"))?;

    let mut count = 0usize;
    let prefix = format!("saves/{world_name}/");
    add_files(&mut zip, world_dir, world_dir, &prefix, options, &mut count)?;
    zip.finish()
        .map_err(|e| format!("Архив мира «{world_name}»: {e}"))?;
    Ok(count)
}

fn add_files(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
    count: &mut usize,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Чтение мира: {e}"))?;
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        if kind.is_dir() {
            add_files(zip, base, &path, prefix, options, count)?;
            continue;
        }
        if !kind.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.eq_ignore_ascii_case(LOCK_FILE) {
            continue;
        }
        let rel = path.strip_prefix(base).unwrap_or(&path);
        let entry_name = format!("{prefix}{}", paths::rel(rel));
        zip.start_file(entry_name, options)
            .map_err(|e| format!("Запись мира: {e}"))?;
        let mut source =
            std::fs::File::open(&path).map_err(|e| format!("Чтение {file_name}: {e}"))?;
        std::io::copy(&mut source, zip).map_err(|e| format!("Запись {file_name}: {e}"))?;
        *count += 1;
    }
    Ok(())
}

/// Ротация: на каждый мир — не больше `keep` свежих архивов.
fn rotate(instance: &str, keep: u32) {
    let mut groups: HashMap<String, Vec<WorldBackup>> = HashMap::new();
    for item in list(instance) {
        if item.legacy || item.world.trim().is_empty() {
            continue;
        }
        groups.entry(item.world.clone()).or_default().push(item);
    }
    for (_, mut items) in groups {
        items.sort_by(|a, b| {
            b.created
                .partial_cmp(&a.created)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.stamp.cmp(&a.stamp))
        });
        for old in items.into_iter().skip(keep as usize) {
            let _ = std::fs::remove_file(&old.path);
        }
    }
}

/// Путь без `..`, абсолютных корней и дисков — защита от zip-slip.
fn safe_rel(name: &str) -> Option<PathBuf> {
    let cleaned = name.replace('\\', "/");
    if cleaned.starts_with('/') || cleaned.contains(':') {
        return None;
    }
    let mut out = PathBuf::new();
    for part in cleaned.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return None;
        }
        out.push(part);
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn extract(
    archive: &mut zip::ZipArchive<std::fs::File>,
    dest: &Path,
    strip_world: bool,
    files: &mut usize,
    skipped: &mut Vec<String>,
) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let Some(enclosed) = entry.enclosed_name() else {
            push_skipped(skipped, entry.name());
            continue;
        };
        let name = enclosed.to_string_lossy().replace('\\', "/");
        let Some(rest) = name.strip_prefix("saves/") else {
            continue;
        };
        if rest.is_empty() {
            continue;
        }
        let relative = if strip_world {
            match rest.split_once('/') {
                Some((_world, tail)) if !tail.is_empty() => tail.to_string(),
                _ => continue,
            }
        } else {
            rest.to_string()
        };
        let Some(rel) = safe_rel(&relative) else {
            push_skipped(skipped, &name);
            continue;
        };
        let target = dest.join(&rel);
        if !target.starts_with(dest) {
            push_skipped(skipped, &name);
            continue;
        }
        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&target);
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let written = std::fs::File::create(&target).and_then(|mut out| {
            std::io::copy(&mut entry, &mut out)?;
            Ok(())
        });
        match written {
            Ok(()) => *files += 1,
            Err(error) if is_sharing_violation(&error) => {
                return Err(SHARING_MESSAGE.to_string());
            }
            Err(_) => push_skipped(skipped, &name),
        }
    }
    Ok(())
}
