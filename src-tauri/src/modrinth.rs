//! Modrinth API: поиск, установка модов и «Ультра FPS».

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::AppHandle;

use crate::http;
use crate::instances;
use crate::models::{ModrinthSearch, UltraFpsResult};
use crate::paths;
use crate::tasks::TaskHandle;

pub const BASE: &str = "https://api.modrinth.com/v2";

fn kind_type(kind: &str) -> &'static str {
    match kind {
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        "modpack" => "modpack",
        _ => "mod",
    }
}

fn loaders_for(loader: &str) -> Option<Vec<&'static str>> {
    match loader {
        "quilt" => Some(vec!["quilt", "fabric"]),
        "fabric" => Some(vec!["fabric"]),
        "forge" => Some(vec!["forge"]),
        "neoforge" => Some(vec!["neoforge"]),
        _ => None,
    }
}

async fn get(path: &str, params: &[(String, String)]) -> Result<Value, String> {
    let url = format!("{BASE}{path}");
    let resp = http::client()
        .get(&url)
        .header("Accept", "application/json")
        .query(params)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Modrinth: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Modrinth HTTP {status}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Modrinth JSON: {e}"))
}

pub async fn search(
    query: &str,
    kind: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<ModrinthSearch, String> {
    let ptype = kind_type(kind);
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{ptype}")]];
    if ptype == "mod" || ptype == "modpack" {
        if let Some(loader) = loader {
            if let Some(list) = loaders_for(loader) {
                facets.push(list.iter().map(|l| format!("categories:{l}")).collect());
            }
        }
    }
    if let Some(version) = mc_version.filter(|v| !v.is_empty()) {
        if ptype != "resourcepack" {
            facets.push(vec![format!("versions:{version}")]);
        }
    }

    let mut params: Vec<(String, String)> = vec![
        ("query".into(), query.to_string()),
        ("limit".into(), limit.clamp(1, 40).to_string()),
        ("offset".into(), offset.to_string()),
        (
            "index".into(),
            if query.trim().is_empty() { "downloads" } else { "relevance" }.into(),
        ),
    ];
    params.push((
        "facets".into(),
        serde_json::to_string(&facets).unwrap_or_else(|_| "[]".into()),
    ));

    let value = get("/search", &params).await?;
    serde_json::from_value::<ModrinthSearch>(value).map_err(|e| format!("Modrinth search: {e}"))
}

pub async fn project_versions(
    project_id: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Vec<Value> {
    let mut params: Vec<(String, String)> = Vec::new();
    if let Some(loader) = loader {
        if let Some(list) = loaders_for(loader) {
            params.push((
                "loaders".into(),
                serde_json::to_string(&list).unwrap_or_else(|_| "[]".into()),
            ));
        }
    }
    if let Some(version) = mc_version.filter(|v| !v.is_empty()) {
        params.push((
            "game_versions".into(),
            serde_json::to_string(&[version]).unwrap_or_else(|_| "[]".into()),
        ));
    }
    match get(&format!("/project/{project_id}/version"), &params).await {
        Ok(Value::Array(list)) => list,
        _ => Vec::new(),
    }
}

async fn pick_version(project_id: &str, loader: &str, mc_version: &str) -> Option<Value> {
    let mut versions = project_versions(project_id, Some(loader), Some(mc_version)).await;
    if versions.is_empty() {
        versions = project_versions(project_id, Some(loader), None).await;
    }
    versions.sort_by(|a, b| {
        let da = a.get("date_published").and_then(|v| v.as_str()).unwrap_or("");
        let db = b.get("date_published").and_then(|v| v.as_str()).unwrap_or("");
        db.cmp(da)
    });
    versions.into_iter().next()
}

fn primary_file(version: &Value) -> Option<Value> {
    let files = version.get("files").and_then(|f| f.as_array())?;
    files
        .iter()
        .find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
        .cloned()
        .or_else(|| files.first().cloned())
}

fn safe_filename(name: &str) -> String {
    Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().replace("..", "_"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "mod.jar".into())
}

/// Найти файл `.mrpack` готовой сборки (последний подходящий по версии/загрузчику).
pub async fn pack_file(
    project_id: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<(String, String, Option<String>), String> {
    let mut versions = project_versions(project_id, loader, mc_version).await;
    if versions.is_empty() {
        versions = project_versions(project_id, loader, None).await;
    }
    if versions.is_empty() {
        versions = project_versions(project_id, None, mc_version).await;
    }
    if versions.is_empty() {
        versions = project_versions(project_id, None, None).await;
    }
    versions.sort_by(|a, b| {
        let da = a.get("date_published").and_then(|v| v.as_str()).unwrap_or("");
        let db = b.get("date_published").and_then(|v| v.as_str()).unwrap_or("");
        db.cmp(da)
    });

    for version in &versions {
        let Some(files) = version.get("files").and_then(|f| f.as_array()) else {
            continue;
        };
        let pick = files
            .iter()
            .find(|f| {
                f.get("filename")
                    .and_then(|n| n.as_str())
                    .map(|n| n.to_lowercase().ends_with(".mrpack"))
                    .unwrap_or(false)
            })
            .or_else(|| files.first());
        let Some(file) = pick else { continue };
        let url = file
            .get("url")
            .and_then(|u| u.as_str())
            .unwrap_or_default()
            .to_string();
        if url.is_empty() {
            continue;
        }
        let filename = safe_filename(
            file.get("filename")
                .and_then(|n| n.as_str())
                .unwrap_or("modpack.mrpack"),
        );
        let sha1 = file
            .get("hashes")
            .and_then(|h| h.get("sha1"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        return Ok((url, filename, sha1));
    }
    Err("У этой сборки нет подходящего файла .mrpack".into())
}

/// Скачать проект и обязательные зависимости. Возвращает имена файлов.
pub async fn install_project(
    project_id: &str,
    kind: &str,
    target_dir: &Path,
    loader: &str,
    mc_version: &str,
    task: Option<&TaskHandle>,
) -> Vec<String> {
    let _ = std::fs::create_dir_all(target_dir);

    let mut queue: VecDeque<(String, usize)> = VecDeque::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut installed: Vec<String> = Vec::new();
    queue.push_back((project_id.to_string(), 0));
    seen.insert(project_id.to_string());

    while let Some((pid, depth)) = queue.pop_front() {
        if depth > 6 {
            continue;
        }
        let Some(version) = pick_version(&pid, loader, mc_version).await else {
            continue;
        };
        let Some(file) = primary_file(&version) else {
            continue;
        };
        let fname = safe_filename(
            file.get("filename")
                .and_then(|f| f.as_str())
                .unwrap_or("mod.jar"),
        );
        let dest = target_dir.join(&fname);
        let url = file.get("url").and_then(|u| u.as_str()).unwrap_or_default();
        let sha1 = file
            .get("hashes")
            .and_then(|h| h.get("sha1"))
            .and_then(|s| s.as_str());

        if !dest.is_file() && !url.is_empty() {
            if let Some(t) = task {
                t.detail(fname.clone());
            }
            if let Err(e) = http::download_file(url, &dest, sha1, task).await {
                eprintln!("[modrinth] {fname}: {e}");
                continue;
            }
        }
        if !installed.iter().any(|f| f == &fname) {
            installed.push(fname);
        }

        if let Some(deps) = version.get("dependencies").and_then(|d| d.as_array()) {
            for dep in deps {
                if dep.get("dependency_type").and_then(|t| t.as_str()) != Some("required") {
                    continue;
                }
                if let Some(dep_id) = dep.get("project_id").and_then(|v| v.as_str()) {
                    if dep_id != pid && seen.insert(dep_id.to_string()) {
                        queue.push_back((dep_id.to_string(), depth + 1));
                    }
                }
            }
        }
        let _ = kind;
    }
    installed
}

/// «Ультра FPS»: Sodium, Lithium, C2ME, FerriteCore + оптимальные JVM-аргументы.
pub async fn ultra_fps(
    app: &AppHandle,
    instance_name: &str,
    task: Option<&TaskHandle>,
) -> Result<UltraFpsResult, String> {
    let mut meta = instances::load(instance_name)
        .ok_or_else(|| format!("Сборка «{instance_name}» не найдена"))?;

    let loader = match meta.loader.as_str() {
        "quilt" => "quilt",
        "fabric" => "fabric",
        "forge" => "forge",
        "neoforge" => "neoforge",
        other => {
            return Err(format!(
                "«Ультра FPS» доступна для Fabric, Quilt, Forge или NeoForge (сейчас {other})"
            ))
        }
    };

    let keywords: Vec<&str> = match loader {
        "forge" => vec!["Embeddium", "FerriteCore", "ModernFix"],
        _ => vec!["Sodium", "Lithium", "C2ME", "FerriteCore"],
    };

    let mods_dir = instances::content_dir(&meta.name, "mod");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mut installed: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();

    for keyword in keywords {
        let found = search(keyword, "mod", Some(loader), Some(&meta.mc_version), 5, 0).await;
        let hit = found.ok().and_then(|r| r.hits.into_iter().next());
        let Some(hit) = hit else {
            failed.push(format!("{keyword}: не найдено"));
            continue;
        };
        if let Some(t) = task {
            t.detail(format!("{keyword} → {}", hit.title));
        }
        let files = install_project(
            &hit.project_id,
            "mod",
            &mods_dir,
            loader,
            &meta.mc_version,
            task,
        )
        .await;
        if files.is_empty() {
            failed.push(format!("{}: нет подходящей версии", hit.title));
        } else {
            installed.extend(files);
        }
    }

    let java_major = 17;
    let plan = instances::optimal_jvm(Some(meta.ram_mb), java_major);
    meta.ram_mb = plan.ram_mb;
    meta.jvm_args = plan.jvm_args.clone();
    meta.ultra_fps_at = instances::now();
    instances::save(&meta)?;

    let _ = app;
    Ok(UltraFpsResult {
        ram_mb: plan.ram_mb,
        gc: plan.gc,
        mods: installed,
        jvm_args: plan.jvm_args,
        failed,
    })
}

/// Установить конкретный проект Modrinth в сборку.
pub async fn install_to_instance(
    project_id: &str,
    kind: &str,
    instance_name: &str,
    task: Option<&TaskHandle>,
) -> Result<Vec<String>, String> {
    let meta = instances::load(instance_name)
        .ok_or_else(|| format!("Сборка «{instance_name}» не найдена"))?;
    let target: PathBuf = instances::content_dir(&meta.name, kind);
    let loader = if meta.loader == "vanilla" {
        "fabric"
    } else {
        meta.loader.as_str()
    };
    Ok(install_project(
        project_id,
        kind,
        &target,
        loader,
        &meta.mc_version,
        task,
    )
    .await)
}

pub fn instance_mods_dir(instance: &str) -> PathBuf {
    paths::game_dir(instance).join("mods")
}
