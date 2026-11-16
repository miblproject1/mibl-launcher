//! Сборки (instances), локальный контент, бэкапы, RAM/JVM.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::models::{ContentFile, Instance, InstancePatch, InstanceView};
use crate::paths;
use crate::version;

pub const KIND_DIRS: [(&str, &str); 3] = [
    ("mod", "mods"),
    ("shader", "shaderpacks"),
    ("resourcepack", "resourcepacks"),
];

pub fn content_dir(instance: &str, kind: &str) -> PathBuf {
    let sub = KIND_DIRS
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, d)| *d)
        .unwrap_or("mods");
    paths::game_dir(instance).join(sub)
}

pub fn load(name: &str) -> Option<Instance> {
    let path = paths::instance_meta_path(name);
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<Instance>(&text).ok()
}

pub fn save(meta: &Instance) -> Result<Instance, String> {
    let dir = paths::instance_dir(&meta.name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("instance.json"), text).map_err(|e| e.to_string())?;
    Ok(meta.clone())
}

pub fn create(
    name: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<String>,
    icon: &str,
    ram_mb: u32,
    jvm_args: Vec<String>,
) -> Result<Instance, String> {
    let safe = paths::safe_name(name);
    let meta = Instance {
        name: safe.clone(),
        mc_version: mc_version.to_string(),
        loader: if loader.is_empty() {
            "vanilla".into()
        } else {
            loader.to_string()
        },
        loader_version,
        icon: if icon.is_empty() { "▣".into() } else { icon.to_string() },
        ram_mb,
        jvm_args,
        created: now(),
        ..Instance::default()
    };
    save(&meta)?;
    for sub in [
        "mods",
        "resourcepacks",
        "shaderpacks",
        "saves",
        "config",
        "logs",
        "crash-reports",
        "backups",
    ] {
        let _ = std::fs::create_dir_all(paths::game_dir(&safe).join(sub));
    }
    let _ = std::fs::create_dir_all(paths::instance_dir(&safe).join("backups"));
    Ok(meta)
}

pub fn update(name: &str, patch: InstancePatch) -> Result<Instance, String> {
    let mut meta = load(name).ok_or_else(|| format!("Сборка «{name}» не найдена"))?;
    let old_name = meta.name.clone();

    if let Some(v) = patch.name {
        let safe = paths::safe_name(&v);
        if safe != old_name {
            // переименование каталога
            let from = paths::instance_dir(&old_name);
            let to = paths::instance_dir(&safe);
            if to.exists() {
                return Err(format!("Сборка «{safe}» уже существует"));
            }
            // Обеспечиваем создание целевой директории перед перемещением
            let parent = to.parent().unwrap_or(&to);
            std::fs::create_dir_all(parent).map_err(|e| format!("Создание папки: {e}"))?;
            std::fs::rename(&from, &to).map_err(|e| format!("Переименование: {e}"))?;
            meta.name = safe;
        }
    }
    if let Some(v) = patch.ram_mb {
        meta.ram_mb = v.clamp(512, 65536);
    }
    if let Some(v) = patch.jvm_args {
        meta.jvm_args = v;
    }
    if let Some(v) = patch.java_path {
        meta.java_path = v.trim().to_string();
    }
    if let Some(v) = patch.icon {
        meta.icon = v;
    }
    if let Some(v) = patch.quick_play_mode {
        meta.quick_play_mode = v;
    }
    if let Some(v) = patch.quick_play_target {
        meta.quick_play_target = v;
    }
    if let Some(v) = patch.game_language {
        meta.game_language = if v.trim().is_empty() {
            "ru_ru".to_string()
        } else {
            v.trim().to_string()
        };
    }
    save(&meta)
}

pub fn delete(name: &str) -> Result<(), String> {
    std::fs::remove_dir_all(paths::instance_dir(name)).map_err(|e| e.to_string())
}

pub fn now() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn version_is_ready(vid: Option<&str>) -> bool {
    let Some(vid) = vid.filter(|v| !v.is_empty()) else {
        return false;
    };
    if !version::version_json_path(vid).is_file() {
        return false;
    }
    match version::resolve_version(vid) {
        Ok((_merged, root)) => {
            // Check if the resolved base version jar exists
            let jar_exists = paths::versions_dir()
                .join(&root)
                .join(format!("{root}.jar"))
                .is_file();
                
            // Even for loader versions that inherit from vanilla, 
            // the main requirement is that we can run the game,
            // so we consider it available if we have its json and the base jar
            jar_exists
        }
        Err(_) => false,
    }
}

fn mods_count(name: &str) -> usize {
    let dir = content_dir(name, "mod");
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    (n.ends_with(".jar") || n.ends_with(".jar.disabled")) && e.path().is_file()
                })
                .count()
        })
        .unwrap_or(0)
}

pub fn list() -> Vec<InstanceView> {
    let dir = paths::instances_dir();
    let mut out: Vec<InstanceView> = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if let Some(meta) = load(&folder) {
            out.push(InstanceView {
                playtime_hours: (meta.playtime_seconds as f64 / 3600.0 * 10.0).round() / 10.0,
                version_ready: version_is_ready(meta.version_id.as_deref()),
                mods_count: mods_count(&meta.name),
                meta,
            });
        }
    }
    out.sort_by(|a, b| {
        b.meta
            .last_played
            .partial_cmp(&a.meta.last_played)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.meta.name.cmp(&b.meta.name))
    });
    out
}

pub fn add_playtime(name: &str, seconds: u64) {
    if let Some(mut meta) = load(name) {
        meta.playtime_seconds = meta.playtime_seconds.saturating_add(seconds);
        meta.last_played = now();
        let _ = save(&meta);
    }
}

// ------------------------------------------------------------------ content
pub fn list_content(instance: &str, kind: &str) -> Vec<ContentFile> {
    let dir = content_dir(instance, kind);
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return out;
    };
    let mut items: Vec<ContentFile> = entries
        .flatten()
        .filter_map(|entry| {
            if !entry.path().is_file() {
                return None;
            }
            let file = entry.file_name().to_string_lossy().to_string();
            let low = file.to_lowercase();
            if !(low.ends_with(".jar")
                || low.ends_with(".zip")
                || low.ends_with(".jar.disabled")
                || low.ends_with(".zip.disabled"))
            {
                return None;
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            Some(ContentFile {
                path: entry.path().to_string_lossy().to_string(),
                enabled: !file.ends_with(".disabled"),
                file,
                size,
            })
        })
        .collect();
    items.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
    out.append(&mut items);
    out
}

pub fn toggle_content(path: &str) -> Result<String, String> {
    let src = PathBuf::from(path);
    let name = src
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| "Некорректный путь".to_string())?;
    let dest = if name.ends_with(".disabled") {
        src.with_file_name(name.trim_end_matches(".disabled"))
    } else {
        src.with_file_name(format!("{name}.disabled"))
    };
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

pub fn delete_content(path: &str) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

// ------------------------------------------------------------------- backup
pub fn backup_worlds(instance: &str) -> Result<PathBuf, String> {
    let src = paths::game_dir(instance).join("saves");
    if !src.is_dir() {
        return Err("Папка saves пуста — нечего сохранять".into());
    }
    let bdir = paths::instance_dir(instance).join("backups");
    std::fs::create_dir_all(&bdir).map_err(|e| e.to_string())?;
    let stamp = timestamp();
    let dest = bdir.join(format!("worlds-{stamp}.zip"));

    let file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    fn walk(
        zip: &mut zip::ZipWriter<std::fs::File>,
        root: &Path,
        dir: &Path,
        options: zip::write::SimpleFileOptions,
        count: &mut usize,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(zip, root, &path, options, count)?;
            } else if path.is_file() {
                let rel = path.strip_prefix(root).unwrap_or(&path);
                let name = format!("saves/{}", rel.to_string_lossy().replace('\\', "/"));
                zip.start_file(name, options).map_err(|e| e.to_string())?;
                let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
                *count += 1;
            }
        }
        Ok(())
    }

    let mut count = 0usize;
    walk(&mut zip, &src, &src, options, &mut count)?;
    zip.finish().map_err(|e| e.to_string())?;
    if count == 0 {
        let _ = std::fs::remove_file(&dest);
        return Err("В папке saves нет файлов".into());
    }
    Ok(dest)
}

pub fn timestamp() -> String {
    let secs = now() as i64;
    // грубый UTC→локальное смещение не критично для имени файла
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ---------------------------------------------------------------- RAM / JVM
pub const AIKAR: [&str; 21] = [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    "-XX:G1HeapRegionSize=8M",
    "-XX:G1ReservePercent=20",
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    "-XX:InitiatingHeapOccupancyPercent=15",
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dusing.aikars.flags=https://mcflags.emc.gs",
    "-Daikars.new.flags=true",
    "-XX:+UseStringDeduplication",
];

pub const ZGC: [&str; 4] = [
    "-XX:+UseZGC",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:ZCollectionInterval=5",
    "-XX:+AlwaysPreTouch",
];

pub fn total_ram_mb() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory() / (1024 * 1024)
}

#[derive(Debug, Clone, Serialize)]
pub struct JvmPlan {
    pub ram_mb: u32,
    pub jvm_args: Vec<String>,
    pub gc: String,
    pub total_ram_mb: u64,
}
pub fn optimal_jvm(ram_mb: Option<u32>, java_major: u32) -> JvmPlan {
    let total = total_ram_mb();
    let xmx = match ram_mb {
        Some(v) => v.clamp(512, 65536),
        None => {
            let half = (total as f64 * 0.5) as u64;
            let clamped = half.clamp(1024, 8192);
            ((clamped / 512) * 512) as u32
        }
    };
    let use_zgc = total >= 16384 && java_major >= 17;
    let flags: Vec<String> = if use_zgc {
        ZGC.iter().map(|s| s.to_string()).collect()
    } else {
        AIKAR.iter().map(|s| s.to_string()).collect()
    };
    JvmPlan {
        ram_mb: xmx,
        jvm_args: flags,
        gc: if use_zgc { "ZGC".into() } else { "G1GC".into() },
        total_ram_mb: total,
    }
}

pub fn java_major_of(vjson: &serde_json::Value) -> u32 {
    vjson
        .get("javaVersion")
        .and_then(|v| v.get("majorVersion"))
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(17)
}
