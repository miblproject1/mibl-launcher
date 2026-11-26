//! Импорт `.mrpack` / `.zip` и экспорт сборки в один архив.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::AppHandle;

use crate::curse;
use crate::http;
use crate::instances;
use crate::loaders;
use crate::models::ImportResult;
use crate::paths;
use crate::tasks::TaskHandle;

const SKIP_DIRS: [&str; 1] = ["backups"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackFile {
    path: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
    #[serde(default)]
    env: Option<HashMap<String, String>>,
    #[serde(default)]
    downloads: Vec<String>,
    #[serde(default)]
    file_size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackIndex {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version_id: String,
    #[serde(default)]
    dependencies: HashMap<String, String>,
    #[serde(default)]
    files: Vec<MrpackFile>,
}

fn safe_relative(path: &str) -> Option<PathBuf> {
    let cleaned = path.replace('\\', "/");
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
    Some(out)
}

fn loader_from_deps(deps: &HashMap<String, String>) -> (String, Option<String>) {
    for (key, loader) in [
        ("fabric-loader", "fabric"),
        ("quilt-loader", "quilt"),
        ("forge", "forge"),
        ("neoforge", "neoforge"),
    ] {
        if let Some(version) = deps.get(key) {
            return (loader.to_string(), Some(version.clone()));
        }
    }
    ("vanilla".to_string(), None)
}

fn extract_prefix(
    archive: &mut zip::ZipArchive<std::fs::File>,
    prefix: &str,
    dest_root: &Path,
    count: &mut usize,
) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();
        let Some(rest) = name.strip_prefix(prefix) else {
            continue;
        };
        if rest.is_empty() {
            continue;
        }
        let Some(rel) = safe_relative(rest) else {
            continue;
        };
        let target = dest_root.join(rel);
        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&target);
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut out) = std::fs::File::create(&target) {
            let _ = std::io::copy(&mut entry, &mut out);
            *count += 1;
        }
    }
    Ok(())
}

fn extract_all(
    archive: &mut zip::ZipArchive<std::fs::File>,
    dest_root: &Path,
    count: &mut usize,
) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.name().to_string();
        if name.starts_with("__MACOSX/") {
            continue;
        }
        let Some(rel) = safe_relative(&name) else {
            continue;
        };
        let target = dest_root.join(rel);
        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&target);
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut out) = std::fs::File::create(&target) {
            let _ = std::io::copy(&mut entry, &mut out);
            *count += 1;
        }
    }
    Ok(())
}

fn read_index(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<MrpackIndex> {
    let mut entry = archive.by_name("modrinth.index.json").ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    serde_json::from_str::<MrpackIndex>(&text).ok()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseFileRef {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(rename = "fileID")]
    file_id: u64,
    #[serde(default = "default_true")]
    required: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseMinecraft {
    #[serde(default)]
    version: String,
    #[serde(default, rename = "modLoaders")]
    mod_loaders: Vec<CurseLoader>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseLoader {
    #[serde(default)]
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    minecraft: CurseMinecraft,
    #[serde(default)]
    files: Vec<CurseFileRef>,
    #[serde(default)]
    overrides: String,
}

fn read_cf_manifest(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<CurseManifest> {
    let mut entry = archive.by_name("manifest.json").ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    serde_json::from_str::<CurseManifest>(&text).ok()
}

fn loader_from_cf_id(id: &str) -> (String, Option<String>) {
    let (prefix, version) = match id.split_once('-') {
        Some(parts) => parts,
        None => return ("vanilla".to_string(), None),
    };
    let loader = match prefix.to_lowercase().as_str() {
        "fabric" => "fabric",
        "quilt" => "quilt",
        "forge" => "forge",
        "neoforge" => "neoforge",
        _ => return ("vanilla".to_string(), None),
    };
    let version = version.trim();
    (
        loader.to_string(),
        if version.is_empty() {
            None
        } else {
            Some(version.to_string())
        },
    )
}

fn pack_file_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().replace("..", "_"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "file.jar".into())
}

pub async fn import(
    app: &AppHandle,
    archive_path: &Path,
    name_override: Option<String>,
    mc_override: Option<String>,
    loader_override: Option<String>,
    loader_version_override: Option<String>,
    icon_url: Option<String>,
    task: Option<&TaskHandle>,
) -> Result<ImportResult, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Архив: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Повреждённый архив: {e}"))?;

    let index = read_index(&mut archive);
    let curse = if index.is_none() {
        read_cf_manifest(&mut archive)
    } else {
        None
    };
    let mut skipped: Vec<String> = Vec::new();

    let (raw_name, mc_version, loader, loader_version) = match (&index, &curse) {
        (Some(idx), _) => {
            let (loader, loader_version) = loader_from_deps(&idx.dependencies);
            let mc = idx
                .dependencies
                .get("minecraft")
                .cloned()
                .or(mc_override.clone())
                .unwrap_or_else(|| "1.20.1".to_string());
            let name = if idx.name.trim().is_empty() {
                archive_path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Импорт".into())
            } else {
                format!("{} {}", idx.name.trim(), idx.version_id.trim())
                    .trim()
                    .to_string()
            };
            (name, mc, loader, loader_version)
        }
        (None, Some(cf)) => {
            let primary = cf
                .minecraft
                .mod_loaders
                .iter()
                .find(|l| l.primary)
                .or_else(|| cf.minecraft.mod_loaders.first());
            let (loader, loader_version) = match primary {
                Some(l) => loader_from_cf_id(&l.id),
                None => ("vanilla".to_string(), None),
            };
            let mc = if cf.minecraft.version.trim().is_empty() {
                mc_override.clone().unwrap_or_else(|| "1.20.1".to_string())
            } else {
                cf.minecraft.version.clone()
            };
            let name = if cf.name.trim().is_empty() {
                archive_path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Импорт".into())
            } else {
                format!("{} {}", cf.name.trim(), cf.version.trim())
                    .trim()
                    .to_string()
            };
            (name, mc, loader, loader_version)
        }
        (None, None) => {
            let name = archive_path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Импорт".into());
            (
                name,
                mc_override.unwrap_or_else(|| "1.20.1".into()),
                loader_override.unwrap_or_else(|| "vanilla".into()),
                loader_version_override,
            )
        }
    };

    let display_name = name_override
        .filter(|n| !n.trim().is_empty())
        .unwrap_or(raw_name);
    let pack_name = instances::unique_name(&display_name);

    let mut meta = instances::create(
        &pack_name,
        &mc_version,
        &loader,
        loader_version.clone(),
        "📦",
        4096,
        Vec::new(),
    )?;
    meta.icon_url = icon_url.unwrap_or_default();
    instances::save(&meta)?;

    if let Some(t) = task {
        t.detail("Установка загрузчика");
    }
    let vid = loaders::install_loader(
        app,
        &mc_version,
        &loader,
        loader_version.as_deref(),
        Some(&meta.name),
        task,
    )
    .await?;

    let mut meta = instances::load(&meta.name).unwrap_or(meta);
    meta.version_id = Some(vid);
    meta.installed = true;
    instances::save(&meta)?;

    let game_dir = paths::game_dir(&meta.name);
    let mut installed_files = 0usize;

    if let Some(idx) = &index {
        let allowed: Vec<&MrpackFile> = idx
            .files
            .iter()
            .filter(|f| {
                let client = f
                    .env
                    .as_ref()
                    .and_then(|e| e.get("client"))
                    .map(|s| s.as_str())
                    .unwrap_or("required");
                client != "unsupported"
            })
            .collect();

        if let Some(t) = task {
            t.set_total(allowed.len() as u64);
            t.detail(format!("Файлы сборки: {}", allowed.len()));
        }

        for file in allowed {
            let Some(rel) = safe_relative(&file.path) else {
                skipped.push(file.path.clone());
                continue;
            };
            let Some(url) = file.downloads.first() else {
                skipped.push(file.path.clone());
                continue;
            };
            let dest = game_dir.join(&rel);
            let sha1 = file.hashes.get("sha1").map(|s| s.as_str());
            match http::download_file(url, &dest, sha1, None).await {
                Ok(_) => installed_files += 1,
                Err(e) => {
                    eprintln!("[mrpack] {}: {e}", file.path);
                    skipped.push(file.path.clone());
                }
            }
            if let Some(t) = task {
                t.add(1);
            }
            let _ = file.file_size;
        }

        let mut overrides_count = 0usize;
        extract_prefix(&mut archive, "overrides/", &game_dir, &mut overrides_count)?;
        extract_prefix(
            &mut archive,
            "client-overrides/",
            &game_dir,
            &mut overrides_count,
        )?;
        installed_files += overrides_count;
    } else if let Some(cf) = &curse {
        let mods_dir = game_dir.join("mods");
        let _ = std::fs::create_dir_all(&mods_dir);
        let required: Vec<&CurseFileRef> = cf.files.iter().filter(|f| f.required).collect();

        if let Some(t) = task {
            t.set_total(required.len() as u64);
            t.detail(format!("Файлы сборки: {}", required.len()));
        }

        for reference in required {
            match curse::file(reference.project_id, reference.file_id).await {
                Ok(info) => {
                    let dest = mods_dir.join(pack_file_name(&info.filename));
                    match http::download_file(&info.url, &dest, info.sha1.as_deref(), None).await {
                        Ok(_) => installed_files += 1,
                        Err(e) => {
                            eprintln!("[curseforge] {}: {e}", info.filename);
                            skipped.push(info.filename);
                        }
                    }
                }
                Err(e) => {
                    eprintln!(
                        "[curseforge] {}/{}: {e}",
                        reference.project_id, reference.file_id
                    );
                    skipped.push(format!(
                        "curseforge {}/{}",
                        reference.project_id, reference.file_id
                    ));
                }
            }
            if let Some(t) = task {
                t.add(1);
            }
        }

        let overrides = {
            let name = cf.overrides.trim_matches('/');
            if name.is_empty() {
                "overrides".to_string()
            } else {
                name.to_string()
            }
        };
        let mut overrides_count = 0usize;
        extract_prefix(
            &mut archive,
            &format!("{overrides}/"),
            &game_dir,
            &mut overrides_count,
        )?;
        installed_files += overrides_count;
    } else {
        let mut count = 0usize;
        extract_all(&mut archive, &game_dir, &mut count)?;
        installed_files = count;
    }

    for sub in ["mods", "resourcepacks", "shaderpacks", "saves"] {
        let _ = std::fs::create_dir_all(game_dir.join(sub));
    }

    let meta = instances::load(&meta.name).unwrap_or(meta);
    Ok(ImportResult {
        instance: meta,
        installed_files,
        skipped,
    })
}

fn walk_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            if dir == root && SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk_files(root, &path, out);
        } else if path.is_file() {
            out.push(path);
        }
    }
}

pub fn export(
    instance_name: &str,
    dest: &Path,
    task: Option<&TaskHandle>,
) -> Result<PathBuf, String> {
    let root = paths::instance_dir(instance_name);
    if !root.is_dir() {
        return Err(format!("Сборка «{instance_name}» не найдена"));
    }
    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let file = std::fs::File::create(dest).map_err(|e| format!("Архив: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut files: Vec<PathBuf> = Vec::new();
    walk_files(&root, &root, &mut files);

    if let Some(t) = task {
        t.set_total(files.len() as u64);
        t.detail(format!("Экспорт: {} файлов", files.len()));
    }

    for path in files {
        let rel = path.strip_prefix(&root).unwrap_or(&path);
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        if let Some(t) = task {
            t.add(1);
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest.to_path_buf())
}
