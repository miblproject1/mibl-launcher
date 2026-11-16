//! CurseForge через открытый прокси `https://api.curse.tools` (без API-ключа).
//!
//! Используется для поиска готовых сборок и загрузки файлов по `manifest.json`.
//! API повторяет официальный `api.curseforge.com/v1`, поэтому структура ответа
//! `{ "data": [...], "pagination": { ... } }` и поля проектов совпадают.

use serde_json::Value;

use crate::http;
use crate::models::{ModpackHit, ModpackSearch};

pub const BASE: &str = "https://curse.tools/v1/cf";
/// Резервный хост на случай, если основной прокси недоступен.
pub const FALLBACK_BASE: &str = "https://api.curse.tools/v1/cf";
pub const GAME_ID: &str = "432";
pub const MODPACK_CLASS_ID: u64 = 4471;
/// Публичный User-Agent лаунчера — обязателен для прокси и CDN CurseForge.
pub const USER_AGENT: &str = concat!("MiblLauncher/", env!("CARGO_PKG_VERSION"));
/// Таймаут запросов CurseForge: 15 секунд.
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

pub struct PackFileInfo {
    pub url: String,
    pub filename: String,
    pub sha1: Option<String>,
}

/// CurseForge `classId` для типа контента.
pub fn class_id(kind: &str) -> Option<u64> {
    match kind {
        "mod" => Some(6),
        "shader" => Some(6552),
        "resourcepack" => Some(12),
        "modpack" => Some(MODPACK_CLASS_ID),
        _ => None,
    }
}

pub fn loader_type(loader: &str) -> Option<&'static str> {
    match loader {
        "forge" => Some("1"),
        "fabric" => Some("4"),
        "quilt" => Some("5"),
        "neoforge" => Some("6"),
        _ => None,
    }
}

fn mod_loader_label(id: u64) -> Option<&'static str> {
    match id {
        1 => Some("forge"),
        4 => Some("fabric"),
        5 => Some("quilt"),
        6 => Some("neoforge"),
        _ => None,
    }
}

/// Безопасное имя файла: только базовое имя, без запрещённых Windows-символов.
fn safe_filename(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file.jar".to_string());
    let mut out = String::with_capacity(base.len());
    for ch in base.chars() {
        let bad = matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            || (ch as u32) < 0x20;
        out.push(if bad { '_' } else { ch });
    }
    let trimmed = out.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "file.jar".to_string()
    } else {
        trimmed
    }
}

/// Экранирование имени файла для пути CDN (пробелы и решётка ломают URL).
fn encode_filename(name: &str) -> String {
    name.replace('%', "%25")
        .replace(' ', "%20")
        .replace('#', "%23")
}

/// Резервная прямая CDN-ссылка CurseForge:
/// `https://mediafilez.forgecdn.net/files/<id/1000>/<id%1000>/<fileName>`.
pub fn cdn_url(file_id: u64, filename: &str) -> String {
    let part1 = file_id / 1000;
    let part2 = file_id % 1000;
    format!(
        "https://mediafilez.forgecdn.net/files/{part1}/{part2}/{}",
        encode_filename(filename)
    )
}

fn loader_label(raw: &str) -> Option<&'static str> {
    let low = raw.to_lowercase();
    if low.contains("neoforge") {
        Some("neoforge")
    } else if low.contains("fabric") {
        Some("fabric")
    } else if low.contains("quilt") {
        Some("quilt")
    } else if low.contains("forge") {
        Some("forge")
    } else {
        None
    }
}

async fn get_from(base: &str, path: &str, params: &[(String, String)]) -> Result<Value, String> {
    let url = format!("{base}{path}");
    let resp = http::client()
        .get(&url)
        // Прокси CurseForge отдаёт 403 без явного Accept и внятного User-Agent.
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .query(params)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| format!("CurseForge: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let snippet: String = text.chars().take(180).collect();
        return Err(format!("CurseForge HTTP {status} — {snippet}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("CurseForge JSON: {e}"))
}

async fn get(path: &str, params: &[(String, String)]) -> Result<Value, String> {
    let mut last_error = String::new();
    for base in [BASE, FALLBACK_BASE] {
        match get_from(base, path, params).await {
            Ok(value) => return Ok(value),
            Err(error) => last_error = error,
        }
    }
    // Понятная подсказка вместо технической ошибки прокси.
    Err(format!(
        "Серверы CurseForge сейчас недоступны. Проверьте подключение к интернету и повторите поиск позже — каталог Modrinth продолжает работать. Техническая деталь: {last_error}"
    ))
}

fn hit_from_value(item: &Value, expected_class: Option<u64>) -> Option<ModpackHit> {
    let id = item.get("id").and_then(|v| v.as_u64())?;
    if let Some(expected) = expected_class {
        if let Some(class_id) = item.get("classId").and_then(|v| v.as_u64()) {
            if class_id != expected {
                return None;
            }
        }
    }
    let title = item
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Без названия")
        .trim()
        .to_string();
    let summary = item
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let slug = item
        .get("slug")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // CurseForge: logo.thumbnailUrl (иногда logo.url).
    let logo = item
        .get("logo")
        .and_then(|l| {
            l.get("thumbnailUrl")
                .and_then(|v| v.as_str())
                .or_else(|| l.get("url").and_then(|v| v.as_str()))
        })
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    let author = item
        .get("authors")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let downloads = item
        .get("downloadCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let available = item
        .get("allowModDistribution")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let mut categories: Vec<String> = Vec::new();
    if let Some(list) = item.get("categories").and_then(|c| c.as_array()) {
        for cat in list {
            if let Some(name) = cat.get("name").and_then(|v| v.as_str()) {
                if !categories.iter().any(|c| c == name) {
                    categories.push(name.to_string());
                }
            }
        }
    }
    if let Some(list) = item.get("latestFilesIndexes").and_then(|c| c.as_array()) {
        for entry in list {
            if let Some(name) = entry.get("categoryName").and_then(|v| v.as_str()) {
                if !name.is_empty() && !categories.iter().any(|c| c == name) {
                    categories.push(name.to_string());
                }
            }
        }
    }

    let mut versions: Vec<String> = Vec::new();
    let mut loaders: Vec<String> = Vec::new();

    // `latestFilesIndexes` — компактный список последних файлов с версиями и лоадером.
    if let Some(list) = item.get("latestFilesIndexes").and_then(|c| c.as_array()) {
        for entry in list {
            if let Some(ver) = entry.get("gameVersion").and_then(|v| v.as_str()) {
                let ver = ver.trim();
                if !ver.is_empty() && !versions.iter().any(|v| v == ver) && versions.len() < 12 {
                    versions.push(ver.to_string());
                }
            }
            if let Some(loader) = entry.get("modLoader").and_then(|v| v.as_u64()) {
                if let Some(label) = mod_loader_label(loader) {
                    if !loaders.iter().any(|l| l == label) {
                        loaders.push(label.to_string());
                    }
                }
            }
        }
    }

    // `latestFiles` (если прокси вернул полные объекты файлов) содержит
    // gameVersions: ["1.20.1", "Fabric", ...].
    if let Some(list) = item.get("latestFiles").and_then(|c| c.as_array()) {
        for file in list {
            if let Some(tags) = file.get("gameVersions").and_then(|v| v.as_array()) {
                for tag in tags {
                    if let Some(raw) = tag.as_str() {
                        if let Some(loader) = loader_label(raw) {
                            if !loaders.iter().any(|l| l == loader) {
                                loaders.push(loader.to_string());
                            }
                        } else {
                            let ver = raw.trim();
                            if !ver.is_empty()
                                && ver.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
                                && !versions.iter().any(|v| v == ver)
                                && versions.len() < 12
                            {
                                versions.push(ver.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Some(ModpackHit {
        id: format!("curseforge:{id}"),
        source: "curseforge".into(),
        project_id: id.to_string(),
        slug,
        title,
        description: summary,
        author,
        downloads,
        icon_url: logo,
        categories,
        versions,
        loaders,
        available,
    })
}

pub async fn search_content(
    query: &str,
    kind: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<ModpackSearch, String> {
    let class = class_id(kind).ok_or_else(|| format!("Неизвестный тип контента: {kind}"))?;
    let mut params: Vec<(String, String)> = vec![
        ("gameId".into(), GAME_ID.into()),
        ("classId".into(), class.to_string()),
        ("pageSize".into(), limit.clamp(1, 50).to_string()),
        ("index".into(), offset.to_string()),
        ("sortField".into(), "6".into()),
        ("sortOrder".into(), "desc".into()),
    ];
    if !query.trim().is_empty() {
        params.push(("searchFilter".into(), query.trim().to_string()));
    }
    if let Some(version) = mc_version.filter(|v| !v.is_empty()) {
        params.push(("gameVersion".into(), version.to_string()));
    }
    // Загрузчик актуален только для модов и сборок.
    if matches!(kind, "mod" | "modpack") {
        if let Some(loader) = loader.and_then(loader_type) {
            params.push(("modLoaderType".into(), loader.to_string()));
        }
    }

    let value = get("/mods/search", &params).await?;
    let hits: Vec<ModpackHit> = value
        .get("data")
        .and_then(|d| d.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|item| hit_from_value(item, Some(class)))
                .collect()
        })
        .unwrap_or_default();
    let total = value
        .get("pagination")
        .and_then(|p| p.get("totalCount"))
        .and_then(|v| v.as_u64())
        .unwrap_or(hits.len() as u64);

    Ok(ModpackSearch {
        hits,
        total_hits: total,
        offset: offset as u64,
        notice: None,
    })
}

pub async fn search(
    query: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<ModpackSearch, String> {
    search_content(query, "modpack", loader, mc_version, limit, offset).await
}

fn file_info(file: &Value) -> Option<PackFileInfo> {
    let filename = safe_filename(
        file.get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("file.jar"),
    );
    let id = file
        .get("id")
        .and_then(|v| v.as_u64())
        .or_else(|| file.get("fileId").and_then(|v| v.as_u64()));
    let url = match file.get("downloadUrl").and_then(|v| v.as_str()) {
        Some(u) if !u.trim().is_empty() => u.to_string(),
        // Автор запретил прямую раздачу через API — собираем CDN-ссылку сами.
        _ => cdn_url(id?, &filename),
    };
    let sha1 = file
        .get("hashes")
        .and_then(|h| h.as_array())
        .and_then(|list| {
            list.iter()
                .find(|h| h.get("algo").and_then(|a| a.as_u64()) == Some(1))
        })
        .and_then(|h| h.get("value"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Some(PackFileInfo {
        url,
        filename,
        sha1,
    })
}

/// Получить конкретный файл мода/сборки по projectID + fileID.
pub async fn file(project_id: u64, file_id: u64) -> Result<PackFileInfo, String> {
    let value = get(&format!("/mods/{project_id}/files/{file_id}"), &[]).await?;
    let file = value
        .get("data")
        .ok_or_else(|| format!("CurseForge: файл {file_id} не найден"))?;
    file_info(file).ok_or_else(|| format!("CurseForge: файл {file_id} недоступен"))
}

fn file_date(file: &Value) -> &str {
    file.get("fileDate").and_then(|v| v.as_str()).unwrap_or("")
}

fn release_rank(file: &Value) -> u64 {
    // 1 — release, 2 — beta, 3 — alpha; релизы всегда выше.
    file.get("releaseType").and_then(|v| v.as_u64()).unwrap_or(1)
}

/// Подобрать последний файл сборки для установки.
pub async fn pack_file(
    project_id: u64,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<PackFileInfo, String> {
    let mut params: Vec<(String, String)> = vec![
        ("pageSize".into(), "50".into()),
        ("index".into(), "0".into()),
    ];
    if let Some(version) = mc_version.filter(|v| !v.is_empty()) {
        params.push(("gameVersion".into(), version.to_string()));
    }
    if let Some(loader) = loader.and_then(loader_type) {
        params.push(("modLoaderType".into(), loader.to_string()));
    }

    let value = get(&format!("/mods/{project_id}/files"), &params).await?;
    let mut files = value
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();

    if files.is_empty() {
        // Фильтры могли быть слишком строгими — берём все файлы проекта.
        let value = get(
            &format!("/mods/{project_id}/files"),
            &[
                ("pageSize".into(), "50".into()),
                ("index".into(), "0".into()),
            ],
        )
        .await?;
        files = value
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();
    }

    files.sort_by(|a, b| {
        release_rank(a)
            .cmp(&release_rank(b))
            .then_with(|| file_date(b).cmp(file_date(a)))
    });

    for file in &files {
        if file
            .get("isServerPack")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }
        let name = file
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        if !name.ends_with(".zip") && !name.ends_with(".mrpack") {
            continue;
        }
        if let Some(info) = file_info(file) {
            return Ok(info);
        }
    }
    Err("У этой сборки нет подходящего файла для скачивания".into())
}

/// Подобрать файл мода/шейдера/ресурспака для установки в сборку.
pub async fn content_file(
    project_id: u64,
    kind: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<PackFileInfo, String> {
    let want_zip = matches!(kind, "shader" | "resourcepack" | "modpack");

    let mut files: Vec<Value> = Vec::new();
    for filtered in [true, false] {
        let mut params: Vec<(String, String)> = vec![
            ("pageSize".into(), "50".into()),
            ("index".into(), "0".into()),
        ];
        if filtered {
            if let Some(version) = mc_version.filter(|v| !v.is_empty()) {
                params.push(("gameVersion".into(), version.to_string()));
            }
            if matches!(kind, "mod" | "modpack") {
                if let Some(loader) = loader.and_then(loader_type) {
                    params.push(("modLoaderType".into(), loader.to_string()));
                }
            }
        }
        let value = get(&format!("/mods/{project_id}/files"), &params).await?;
        files = value
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();
        if !files.is_empty() {
            break;
        }
    }

    files.sort_by(|a, b| {
        release_rank(a)
            .cmp(&release_rank(b))
            .then_with(|| file_date(b).cmp(file_date(a)))
    });

    let pick = |files: &[Value], strict: bool| -> Option<PackFileInfo> {
        for file in files {
            if file
                .get("isServerPack")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                continue;
            }
            let name = file
                .get("fileName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let matches = if want_zip {
                name.ends_with(".zip")
            } else {
                name.ends_with(".jar")
            };
            if strict && !matches {
                continue;
            }
            if let Some(info) = file_info(file) {
                return Some(info);
            }
        }
        None
    };

    pick(&files, true)
        .or_else(|| pick(&files, false))
        .ok_or_else(|| "У этого проекта нет подходящего файла для скачивания".into())
}
