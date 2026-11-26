//! CurseForge (https://curseforge.com) через официальный API и публичный прокси.
//!
//! Используется для поиска готовых сборок и загрузки файлов по `manifest.json`.
//! Структура ответа официального API `{ "data": [...], "pagination": { ... } }`
//! совпадает с ответом прокси `api.curse.tools`, поэтому остальной код
//! работает с обоими источниками одинаково.
//!
//! Если пользователь указал личный ключ в настройках, запросы идут напрямую
//! в `https://api.curseforge.com/v1` с заголовком `x-api-key`. Без ключа
//! используется публичный прокси `https://api.curse.tools/v1/cf`, который не
//! требует ключа и отдаёт те же `data[]`.

use serde_json::Value;

use crate::http;
use crate::models::{ModpackHit, ModpackSearch};

/// Официальный API CurseForge. Пути в коде начинаются с `/`, поэтому
/// `/mods/search` превращается в `https://api.curseforge.com/v1/mods/search`.
pub const BASE: &str = "https://api.curseforge.com/v1";
/// Публичный прокси CurseForge, работающий без API-ключа.
pub const FALLBACK_BASE: &str = "https://api.curse.tools/v1/cf";
/// Ключ доступа к API CurseForge (`x-api-key`).
///
/// Реальный ключ подставляется на этапе сборки из переменной окружения
/// `CURSEFORGE_API_KEY`. Без ключа лаунчер автоматически переключается на
/// публичный прокси, поэтому каталог остаётся доступным.
const CURSEFORGE_API_KEY: &str = match option_env!("CURSEFORGE_API_KEY") {
    Some(key) => key,
    None => "ВСТАВЬ_КЛЮЧ",
};

/// Ключ, готовый к отправке: сначала личный ключ из настроек лаунчера,
/// затем ключ сборки из переменной окружения. Пустые значения и заглушки
/// отбрасываются.
fn is_placeholder(key: &str) -> bool {
    key.is_empty() || key == "ВСТАВЬ_КЛЮЧ" || key == "ВСТАВЬ_СЮДА_КЛЮЧ"
}

fn configured_api_key() -> Option<String> {
    let from_settings = crate::store::load_config().curseforge_api_key;
    let from_settings = from_settings.trim();
    if !is_placeholder(from_settings) {
        return Some(from_settings.to_string());
    }
    let key = CURSEFORGE_API_KEY.trim();
    if is_placeholder(key) {
        None
    } else {
        Some(key.to_string())
    }
}
pub const GAME_ID: &str = "432";
pub const MODPACK_CLASS_ID: u64 = 4471;
/// Публичный User-Agent лаунчера — обязателен для шлюза и CDN CurseForge.
pub const USER_AGENT: &str = concat!("MiblLauncher/", env!("CARGO_PKG_VERSION"));
/// Таймаут запросов CurseForge: 15 секунд.
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

pub struct PackFileInfo {
    pub url: String,
    pub filename: String,
    pub sha1: Option<String>,
}

/// Нормализованный тип контента (принимает и единственное, и множественное число).
fn content_kind(kind: &str) -> Option<&'static str> {
    match kind.to_lowercase().as_str() {
        "mod" | "mods" => Some("mod"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => Some("shader"),
        "resourcepack" | "resourcepacks" | "texturepack" | "texturepacks" => Some("resourcepack"),
        "modpack" | "modpacks" => Some("modpack"),
        _ => None,
    }
}

/// CurseForge `classId` для типа контента.
pub fn class_id(kind: &str) -> Option<u64> {
    match content_kind(kind)? {
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
/// `https://edge.forgecdn.net/files/<id/1000>/<id%1000, 3 цифры>/<fileName>`.
///
/// Нужна, когда мод отдаёт `downloadUrl: null` (автор запретил раздачу через API).
pub fn cdn_url(file_id: u64, filename: &str) -> String {
    let part1 = file_id / 1000;
    let part2 = file_id % 1000;
    format!(
        "https://edge.forgecdn.net/files/{part1}/{part2:03}/{}",
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

/// Короткий пересказ тела ответа без сырого HTML — чтобы ошибки оставались читаемыми.
fn clean_body(text: &str) -> String {
    let trimmed = text.trim_start();
    // HTML-страницы ошибок (Cloudflare, заглушки шлюза) в сообщение не попадают.
    if trimmed.starts_with('<') {
        return String::new();
    }
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(180).collect()
}

/// Признак того, что вместо JSON пришла HTML/XML-страница: JSON никогда не начинается с `<`.
fn looks_like_html(text: &str) -> bool {
    text.trim_start().starts_with('<')
}

async fn get_from(
    base: &str,
    api_key: Option<&str>,
    path: &str,
    params: &[(String, String)],
) -> Result<Value, String> {
    let url = format!("{base}{path}");
    let mut request = http::client()
        .get(&url)
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .query(params)
        .timeout(REQUEST_TIMEOUT);
    // Официальный API требует ключ, публичный прокси — нет. Заголовок
    // добавляем только когда ключ действительно есть.
    if let Some(key) = api_key {
        request = request.header("x-api-key", key);
    }
    let resp = request
        .send()
        .await
        .map_err(|e| format!("CurseForge: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // Тело ошибки может быть огромной HTML-страницей — оставляем только статус.
        let detail = clean_body(&text);
        return Err(if detail.is_empty() {
            format!("CurseForge HTTP {status}")
        } else {
            format!("CurseForge HTTP {status} — {detail}")
        });
    }
    if looks_like_html(&text) {
        return Err(format!(
            "CurseForge HTTP {status}: сервер вернул HTML вместо JSON — проверьте адрес API и ключ доступа"
        ));
    }
    let value: Value =
        serde_json::from_str(&text).map_err(|e| format!("CurseForge JSON: {e}"))?;
    // Некоторые прокси отдают голый массив вместо `{ "data": [...] }`.
    Ok(match value {
        Value::Array(list) => serde_json::json!({ "data": list }),
        other => other,
    })
}

async fn get(path: &str, params: &[(String, String)]) -> Result<Value, String> {
    let api_key = configured_api_key();
    let mut attempts: Vec<(&str, Option<&str>)> = Vec::new();
    if let Some(key) = api_key.as_deref() {
        attempts.push((BASE, Some(key)));
    }
    // Без ключа (или если официальный API отклонил ключ) используем
    // публичный прокси, который отдаёт тот же формат `data[]`.
    attempts.push((FALLBACK_BASE, None));

    let mut errors: Vec<String> = Vec::new();
    for (base, key) in attempts {
        match get_from(base, key, path, params).await {
            Ok(value) => return Ok(value),
            Err(error) => errors.push(format!("{base}: {error}")),
        }
    }
    // Понятная подсказка вместо технической ошибки шлюза.
    Err(format!(
        "Серверы CurseForge сейчас недоступны. Проверьте подключение к интернету и повторите поиск позже — каталог Modrinth продолжает работать. Можно также указать личный ключ в настройках, чтобы запросы шли напрямую. Техническая деталь: {}",
        errors.join(" | ")
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

    // `latestFiles` (если API вернул полные объекты файлов) содержит
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
    let kind = content_kind(kind).ok_or_else(|| format!("Неизвестный тип контента: {kind}"))?;
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

fn file_info(file: &Value) -> Result<PackFileInfo, String> {
    let raw_name = file
        .get("fileName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let filename = safe_filename(if raw_name.is_empty() {
        "file.jar"
    } else {
        raw_name
    });
    let id = file
        .get("id")
        .and_then(|v| v.as_u64())
        .or_else(|| file.get("fileId").and_then(|v| v.as_u64()));
    let url = match file
        .get("downloadUrl")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|u| !u.is_empty())
    {
        Some(u) => u.to_string(),
        // Автор запретил прямую раздачу через API (`downloadUrl: null`) — собираем
        // CDN-ссылку из ID файла, а если и ID нет, отдаём понятную ошибку.
        None => match id {
            Some(id) => cdn_url(id, &filename),
            None => {
                return Err(
                    "автор запретил прямое скачивание, а ID файла отсутствует в ответе API"
                        .to_string(),
                )
            }
        },
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
    Ok(PackFileInfo {
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
    file_info(file).map_err(|reason| format!("CurseForge: файл {file_id} недоступен — {reason}"))
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

    let mut last_reason = String::new();
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
        match file_info(file) {
            Ok(info) => return Ok(info),
            Err(reason) => last_reason = reason,
        }
    }
    Err(if last_reason.is_empty() {
        "У этой сборки нет подходящего файла для скачивания".to_string()
    } else {
        format!("У этой сборки нет подходящего файла для скачивания: {last_reason}")
    })
}

/// Подобрать файл мода/шейдера/ресурспака для установки в сборку.
pub async fn content_file(
    project_id: u64,
    kind: &str,
    loader: Option<&str>,
    mc_version: Option<&str>,
) -> Result<PackFileInfo, String> {
    let kind = content_kind(kind).ok_or_else(|| format!("Неизвестный тип контента: {kind}"))?;

    // Шейдеры (classId 6552) и ресурспаки (classId 12) не привязаны к
    // Forge/Fabric/NeoForge/Quilt — подбираем файл только по версии игры.
    if matches!(kind, "shader" | "resourcepack") {
        return game_content_file(project_id, kind, mc_version).await;
    }

    let want_zip = kind == "modpack";
    let mut files = fetch_content_files(project_id, mc_version, loader).await?;
    if files.is_empty() {
        // Фильтры могли быть слишком строгими — берём все файлы проекта.
        files = fetch_content_files(project_id, None, None).await?;
    }
    sort_content_files(&mut files);

    if let Ok(info) = pick_content_file(&files, want_zip, true) {
        return Ok(info);
    }
    match pick_content_file(&files, want_zip, false) {
        Ok(info) => Ok(info),
        Err(reason) if !reason.is_empty() => Err(format!(
            "У этого проекта нет подходящего файла для скачивания: {reason}"
        )),
        Err(_) => Err("У этого проекта нет подходящего файла для скачивания".into()),
    }
}

fn file_game_versions(file: &Value) -> &[Value] {
    file.get("gameVersions")
        .and_then(|v| v.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[])
}

fn file_matches_game(file: &Value, wanted: &str) -> bool {
    file_game_versions(file)
        .iter()
        .any(|version| version.as_str() == Some(wanted))
}

/// «1.21.4» → «1.21»: минорная ветка для мягкого фоллбэка шейдеров/ресурспаков.
fn minor_branch(mc_version: &str) -> Option<String> {
    let mut parts = mc_version.split('.');
    let major = parts.next()?.trim();
    let minor = parts.next()?.trim();
    if major.is_empty() || minor.is_empty() {
        return None;
    }
    Some(format!("{major}.{minor}"))
}

fn file_matches_minor(file: &Value, branch: &str) -> bool {
    let prefix = format!("{branch}.");
    file_game_versions(file).iter().any(|version| {
        let Some(game_version) = version.as_str() else {
            return false;
        };
        game_version == branch || game_version.starts_with(&prefix)
    })
}

fn sort_content_files(files: &mut [Value]) {
    files.sort_by(|a, b| {
        release_rank(a)
            .cmp(&release_rank(b))
            .then_with(|| file_date(b).cmp(file_date(a)))
    });
}

fn pick_content_file(
    files: &[Value],
    want_zip: bool,
    strict: bool,
) -> Result<PackFileInfo, String> {
    let mut last_reason = String::new();
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
        match file_info(file) {
            Ok(info) => return Ok(info),
            Err(reason) => last_reason = reason,
        }
    }
    Err(last_reason)
}

async fn fetch_content_files(
    project_id: u64,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut params: Vec<(String, String)> = vec![
        ("pageSize".into(), "50".into()),
        ("index".into(), "0".into()),
    ];
    if let Some(version) = game_version.filter(|v| !v.is_empty()) {
        params.push(("gameVersion".into(), version.to_string()));
    }
    if let Some(loader) = loader.and_then(loader_type) {
        params.push(("modLoaderType".into(), loader.to_string()));
    }
    let value = get(&format!("/mods/{project_id}/files"), &params).await?;
    Ok(value
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default())
}

/// Мягкий подбор файла шейдера/ресурспака:
/// точная версия игры → та же минорная ветка (1.21.x) → самый свежий релиз.
async fn game_content_file(
    project_id: u64,
    kind: &str,
    mc_version: Option<&str>,
) -> Result<PackFileInfo, String> {
    let wanted = mc_version.filter(|version| !version.is_empty());

    if let Some(version) = wanted {
        let mut exact = fetch_content_files(project_id, Some(version), None).await?;
        // Прокси может проигнорировать фильтр — проверяем совпадение сами.
        exact.retain(|file| file_matches_game(file, version));
        sort_content_files(&mut exact);
        if let Ok(info) = pick_content_file(&exact, true, true) {
            return Ok(info);
        }
    }

    let mut files = fetch_content_files(project_id, None, None).await?;
    sort_content_files(&mut files);

    if let Some(version) = wanted {
        if let Some(branch) = minor_branch(version) {
            let mut branch_files: Vec<Value> = files
                .iter()
                .filter(|file| file_matches_minor(file, &branch))
                .cloned()
                .collect();
            sort_content_files(&mut branch_files);
            if let Ok(info) = pick_content_file(&branch_files, true, true) {
                return Ok(info);
            }
        }
    }

    let label = if kind == "shader" {
        "шейдера"
    } else {
        "ресурспака"
    };
    match pick_content_file(&files, true, true) {
        Ok(info) => Ok(info),
        Err(reason) if !reason.is_empty() => Err(format!(
            "У этого {label} нет подходящего файла для скачивания: {reason}"
        )),
        Err(_) => Err(format!("У этого {label} нет подходящего файла для скачивания")),
    }
}
