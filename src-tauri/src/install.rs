//! Установка версии: клиент, библиотеки, нативы, ассеты, Java.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use futures_util::{stream, StreamExt};
use serde_json::Value;
use tauri::AppHandle;

use crate::http;
use crate::paths;
use crate::tasks::TaskHandle;
use crate::version::{self, JAVA_ALL_URL, RESOURCES_URL};

#[derive(Debug, Clone)]
pub struct Artifact {
    pub path: String,
    pub url: String,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

fn maven_to_path(name: &str, base_url: Option<&str>) -> Option<(String, String)> {
    let (name, ext) = match name.split_once('@') {
        Some((n, e)) => (n, e),
        None => (name, "jar"),
    };
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let (group, artifact, ver) = (parts[0], parts[1], parts[2]);
    let classifier = parts.get(3).copied();
    let mut rel = format!(
        "{}/{}/{}/{}-{}",
        group.replace('.', "/"),
        artifact,
        ver,
        artifact,
        ver
    );
    if let Some(c) = classifier {
        rel.push('-');
        rel.push_str(c);
    }
    rel.push('.');
    rel.push_str(ext);
    let base = base_url.unwrap_or("https://libraries.minecraft.net/");
    let base = if base.ends_with('/') {
        base.to_string()
    } else {
        format!("{base}/")
    };
    Some((rel.clone(), format!("{base}{rel}")))
}

/// (артефакты для classpath, джарники нативов)
pub fn collect_libraries(vjson: &Value) -> (Vec<Artifact>, Vec<Artifact>) {
    let mut artifacts: Vec<Artifact> = Vec::new();
    let mut natives: Vec<Artifact> = Vec::new();

    let Some(list) = vjson.get("libraries").and_then(|v| v.as_array()) else {
        return (artifacts, natives);
    };

    for lib in list {
        if !version::lib_allowed(lib) {
            continue;
        }
        let name = lib.get("name").and_then(|v| v.as_str()).unwrap_or_default();
        let downloads = lib.get("downloads");

        // старый стиль LWJGL2: основная библиотека + отдельный classifier нативов
        if let Some(nat) = lib.get("natives") {
            // Основной артефакт всё равно нужен в classpath (lwjgl, jinput…).
            if let Some(art) = downloads.and_then(|d| d.get("artifact")) {
                if let (Some(path), Some(url)) = (
                    art.get("path").and_then(|v| v.as_str()),
                    art.get("url").and_then(|v| v.as_str()),
                ) {
                    artifacts.push(Artifact {
                        path: path.to_string(),
                        url: url.to_string(),
                        sha1: art.get("sha1").and_then(|v| v.as_str()).map(String::from),
                        size: art.get("size").and_then(|v| v.as_u64()),
                    });
                }
            }
            if let Some(key) = nat.get("windows").and_then(|v| v.as_str()) {
                let key = key.replace("${arch}", "64");
                if let Some(info) = downloads
                    .and_then(|d| d.get("classifiers"))
                    .and_then(|c| c.get(&key))
                {
                    if let (Some(path), Some(url)) = (
                        info.get("path").and_then(|v| v.as_str()),
                        info.get("url").and_then(|v| v.as_str()),
                    ) {
                        natives.push(Artifact {
                            path: path.to_string(),
                            url: url.to_string(),
                            sha1: info.get("sha1").and_then(|v| v.as_str()).map(String::from),
                            size: info.get("size").and_then(|v| v.as_u64()),
                        });
                    }
                }
            }
            continue;
        }

        // современный стиль: отдельная запись natives-windows
        if name.contains(":natives-windows") {
            // На x64 берём только x64-натив. Иначе arm64/x86 DLL при
            // распаковке в общую папку перезапишут правильные файлы.
            let is_x64 = name.ends_with(":natives-windows")
                || name.ends_with(":natives-windows-64")
                || name.ends_with(":natives-windows-x86_64");
            if !is_x64 {
                continue;
            }
            if let Some(art) = downloads.and_then(|d| d.get("artifact")) {
                if let (Some(path), Some(url)) = (
                    art.get("path").and_then(|v| v.as_str()),
                    art.get("url").and_then(|v| v.as_str()),
                ) {
                    let item = Artifact {
                        path: path.to_string(),
                        url: url.to_string(),
                        sha1: art.get("sha1").and_then(|v| v.as_str()).map(String::from),
                        size: art.get("size").and_then(|v| v.as_u64()),
                    };
                    natives.push(item.clone());
                    artifacts.push(item);
                }
            }
            continue;
        }

        if let Some(art) = downloads.and_then(|d| d.get("artifact")) {
            if let (Some(path), Some(url)) = (
                art.get("path").and_then(|v| v.as_str()),
                art.get("url").and_then(|v| v.as_str()),
            ) {
                artifacts.push(Artifact {
                    path: path.to_string(),
                    url: url.to_string(),
                    sha1: art.get("sha1").and_then(|v| v.as_str()).map(String::from),
                    size: art.get("size").and_then(|v| v.as_u64()),
                });
                continue;
            }
        }

        let base = lib.get("url").and_then(|v| v.as_str());
        if let Some((rel, url)) = maven_to_path(name, base) {
            artifacts.push(Artifact {
                path: rel,
                url,
                sha1: None,
                size: None,
            });
        }
    }
    (artifacts, natives)
}

pub fn library_path(rel: &str) -> PathBuf {
    paths::libraries_dir().join(rel.replace('/', std::path::MAIN_SEPARATOR_STR))
}

pub async fn download_libraries(
    vjson: &Value,
    task: Option<&TaskHandle>,
) -> Result<(Vec<PathBuf>, Vec<PathBuf>), String> {
    let (artifacts, natives) = collect_libraries(vjson);

    let mut seen = HashSet::new();
    let mut jobs: Vec<Artifact> = Vec::new();
    for a in artifacts.iter().chain(natives.iter()) {
        if seen.insert(a.path.clone()) {
            jobs.push(a.clone());
        }
    }

    if let Some(t) = task {
        t.set_total(jobs.len() as u64);
        t.detail(format!("библиотеки: {}", jobs.len()));
    }

    let results = stream::iter(jobs.into_iter().map(|job| async move {
        let dest = library_path(&job.path);
        let res = http::download_file(&job.url, &dest, job.sha1.as_deref(), task).await;
        if let Some(t) = task {
            t.add(1);
        }
        (job.path, res)
    }))
    .buffer_unordered(10)
    .collect::<Vec<_>>()
    .await;

    let mut failed = 0usize;
    for (_path, res) in &results {
        if res.is_err() {
            failed += 1;
        }
    }
    if failed > 0 {
        eprintln!("[libraries] не удалось скачать {failed} файлов");
    }

    let mut cp_seen = HashSet::new();
    let classpath = artifacts
        .iter()
        .filter(|a| cp_seen.insert(a.path.clone()))
        .map(|a| library_path(&a.path))
        .collect();
    let mut nat_seen = HashSet::new();
    let native_paths = natives
        .iter()
        .filter(|a| nat_seen.insert(a.path.clone()))
        .map(|a| library_path(&a.path))
        .collect();
    Ok((classpath, native_paths))
}

pub fn extract_natives(jars: &[PathBuf], dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for jar in jars {
        if !jar.is_file() {
            continue;
        }
        let Ok(file) = std::fs::File::open(jar) else {
            continue;
        };
        let Ok(mut zip) = zip::ZipArchive::new(file) else {
            continue;
        };
        for i in 0..zip.len() {
            let Ok(mut entry) = zip.by_index(i) else {
                continue;
            };
            let name = entry.name().to_string();
            if name.ends_with('/') || name.starts_with("META-INF/") {
                continue;
            }
            let lower = name.to_lowercase();
            if !(lower.ends_with(".dll")
                || lower.ends_with(".so")
                || lower.ends_with(".dylib")
                || lower.ends_with(".jnilib"))
            {
                continue;
            }
            let target = dest.join(Path::new(&name).file_name().unwrap_or_default());
            if let Ok(mut out) = std::fs::File::create(target) {
                let _ = std::io::copy(&mut entry, &mut out);
            }
        }
    }
    Ok(())
}

/// Единая папка нативов для версии/сборки. Возвращает точный абсолютный путь:
/// именно он попадает в `-Djava.library.path=...`.
pub fn natives_dir_for(vid: &str) -> PathBuf {
    let dir = paths::natives_dir().join(paths::safe_name(vid));
    let _ = std::fs::create_dir_all(&dir);
    if dir.is_absolute() {
        // Не используем canonicalize: на Windows он добавляет префикс \\?\,
        // который JVM может не понять в java.library.path.
        dir
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(&dir))
            .unwrap_or(dir)
    }
}

fn count_dlls(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext.eq_ignore_ascii_case("dll"))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

/// Распаковать архивы нативов в единую папку версии.
pub fn finalize_natives(vid: &str, jars: &[PathBuf]) -> Result<PathBuf, String> {
    let dir = natives_dir_for(vid);
    extract_natives(jars, &dir)?;
    if count_dlls(&dir) == 0 {
        eprintln!(
            "[natives] в {} не найдено ни одной DLL (архивов: {})",
            dir.display(),
            jars.len()
        );
    }
    Ok(dir)
}

/// Скачать и распаковать нативные библиотеки из **всей** цепочки `inheritsFrom`
/// (JSON лоадера + JSON родительской ванильной версии).
pub async fn prepare_natives(
    vid: &str,
    task: Option<&TaskHandle>,
) -> Result<PathBuf, String> {
    let libraries = version::chain_libraries(vid)?;
    let vjson = serde_json::json!({ "libraries": libraries });
    let (_artifacts, natives) = collect_libraries(&vjson);

    if let Some(t) = task {
        t.detail(format!("Нативы: {} архивов", natives.len()));
    }

    let mut seen = HashSet::new();
    let mut jars: Vec<PathBuf> = Vec::new();
    for art in natives {
        if !seen.insert(art.path.clone()) {
            continue;
        }
        let dest = library_path(&art.path);
        match http::download_file(&art.url, &dest, art.sha1.as_deref(), None).await {
            Ok(()) => jars.push(dest),
            Err(e) => eprintln!("[natives] {}: {e}", art.path),
        }
    }

    finalize_natives(vid, &jars)
}

pub async fn download_assets(vjson: &Value, task: Option<&TaskHandle>) -> Result<(), String> {
    let Some(index) = vjson.get("assetIndex") else {
        return Ok(());
    };
    let Some(index_id) = index.get("id").and_then(|v| v.as_str()) else {
        return Ok(());
    };
    let index_url = index.get("url").and_then(|v| v.as_str()).unwrap_or_default();
    let index_sha1 = index.get("sha1").and_then(|v| v.as_str());
    let index_path = paths::assets_dir().join("indexes").join(format!("{index_id}.json"));

    http::download_file(index_url, &index_path, index_sha1, None).await?;

    let text = std::fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let objects = parsed
        .get("objects")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let count = objects.len();
    if let Some(t) = task {
        t.set_total(count as u64);
        t.detail(format!("ресурсы: {count}"));
    }

    let items: Vec<(String, String)> = objects
        .values()
        .filter_map(|obj| obj.get("hash").and_then(|h| h.as_str()).map(|h| h.to_string()))
        .map(|h| {
            let url = format!("{RESOURCES_URL}/{}/{}", &h[..2], h);
            (h, url)
        })
        .collect();

    let results = stream::iter(items.into_iter().map(|(hash, url)| {
        let task = task;
        async move {
            let dest = paths::assets_dir()
                .join("objects")
                .join(&hash[..2])
                .join(&hash);
            let res = http::download_file(&url, &dest, Some(&hash), None).await;
            if let Some(t) = task {
                t.add(1);
            }
            res
        }
    }))
    .buffer_unordered(16)
    .collect::<Vec<_>>()
    .await;

    let failed = results.iter().filter(|r| r.is_err()).count();
    if failed > 0 {
        eprintln!("[assets] не удалось скачать {failed} из {count}");
    }
    Ok(())
}

pub fn java_path_for(component: &str) -> PathBuf {
    paths::runtime_dir().join(component).join("bin").join("java.exe")
}

pub fn find_java_fallback() -> Option<String> {
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(home).join("bin").join("java.exe");
        if crate::java::is_valid_java(&p) {
            return Some(p.to_string_lossy().to_string());
        }
    }
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        // Сломанные ярлыки Oracle javapath часто не содержат java.dll.
        let text = dir.to_string_lossy().to_lowercase().replace('/', "\\");
        if text.contains("common files\\oracle\\java\\javapath") {
            continue;
        }
        let p = dir.join("java.exe");
        if crate::java::is_valid_java(&p) {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

fn local_java_ok(local: &Path, major: Option<u32>) -> bool {
    crate::java::is_valid_java(local)
        && major
            .map(|required| crate::java::java_major_of(local) == Some(required))
            .unwrap_or(true)
}

/// Резерв, если Mojang-рантайм не скачался: подобрать/скачать нужную Java
/// (включая Java 25 для Minecraft 26.x) через Adoptium.
async fn fallback_java(
    major: Option<u32>,
    task: Option<&TaskHandle>,
) -> Result<Option<String>, String> {
    if let Some(required) = major {
        return crate::java::ensure_major(required, None, task).await.map(Some);
    }
    Ok(find_java_fallback())
}

/// Путь к java для версии; скачивает окружение Mojang при необходимости.
pub async fn ensure_java(
    vjson: &Value,
    task: Option<&TaskHandle>,
) -> Result<Option<String>, String> {
    let major = crate::java::manifest_java_major(vjson);
    let component = vjson
        .get("javaVersion")
        .and_then(|v| v.get("component"))
        .and_then(|v| v.as_str())
        .unwrap_or("jre-legacy");

    let local = java_path_for(component);
    if local_java_ok(&local, major) {
        return Ok(Some(local.to_string_lossy().to_string()));
    }

    let all = match http::get_json(JAVA_ALL_URL).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[java] all.json: {e}");
            return fallback_java(major, task).await;
        }
    };

    let platform = all.get("windows-x64");
    let candidates = [
        "component",
        "java-runtime-epsilon",
        "java-runtime-delta",
        "java-runtime-gamma",
        "jre-legacy",
    ];
    let mut manifest_url: Option<String> = None;
    for key in candidates {
        let name = if key == "component" { component } else { key };
        if let Some(arr) = platform.and_then(|p| p.get(name)).and_then(|v| v.as_array()) {
            if let Some(url) = arr
                .first()
                .and_then(|e| e.get("manifest"))
                .and_then(|m| m.get("url"))
                .and_then(|u| u.as_str())
            {
                manifest_url = Some(url.to_string());
                break;
            }
        }
    }
    let Some(url) = manifest_url else {
        return fallback_java(major, task).await;
    };

    let manifest = http::get_json(&url).await?;
    let files = manifest
        .get("files")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let total = files.len();
    if let Some(t) = task {
        t.set_total(total as u64);
        t.detail(format!("Java ({component})"));
    }

    let root = paths::runtime_dir().join(component);
    let mut jobs: Vec<(String, PathBuf, Option<String>)> = Vec::new();
    for (rel, meta) in &files {
        let dest = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mtype = meta.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if mtype == "directory" {
            let _ = std::fs::create_dir_all(&dest);
            if let Some(t) = task {
                t.add(1);
            }
            continue;
        }
        if mtype != "file" {
            if let Some(t) = task {
                t.add(1);
            }
            continue;
        }
        let downloads = meta.get("downloads");
        let info = downloads
            .and_then(|d| d.get("raw").or_else(|| d.get("lzma")));
        if let Some(info) = info {
            if let Some(u) = info.get("url").and_then(|v| v.as_str()) {
                jobs.push((
                    u.to_string(),
                    dest,
                    info.get("sha1").and_then(|v| v.as_str()).map(String::from),
                ));
            }
        }
    }

    let results = stream::iter(jobs.into_iter().map(|(u, dest, sha1)| {
        let task = task;
        async move {
            let res = http::download_file(&u, &dest, sha1.as_deref(), None).await;
            if let Some(t) = task {
                t.add(1);
            }
            res
        }
    }))
    .buffer_unordered(8)
    .collect::<Vec<_>>()
    .await;
    let failed = results.iter().filter(|r| r.is_err()).count();
    if failed > 0 {
        eprintln!("[java] {failed} файлов не скачано");
    }

    if local_java_ok(&local, major) {
        Ok(Some(local.to_string_lossy().to_string()))
    } else {
        fallback_java(major, task).await
    }
}

/// Полная установка версии (json + client jar + библиотеки + ресурсы + java).
pub async fn install_version(
    app: &AppHandle,
    vid: &str,
    entry_url: &str,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    let vdir = paths::versions_dir().join(vid);
    std::fs::create_dir_all(&vdir).map_err(|e| e.to_string())?;

    if let Some(t) = task {
        t.detail(format!("описание версии {vid}"));
    }
    let vjson = http::get_json(entry_url).await?;
    let text = serde_json::to_string_pretty(&vjson).map_err(|e| e.to_string())?;
    std::fs::write(vdir.join(format!("{vid}.json")), text).map_err(|e| e.to_string())?;

    if let Some(client) = vjson.get("downloads").and_then(|d| d.get("client")) {
        if let (Some(url), Some(sha1)) = (
            client.get("url").and_then(|v| v.as_str()),
            client.get("sha1").and_then(|v| v.as_str()),
        ) {
            if let Some(t) = task {
                t.detail(format!("клиент {vid}"));
            }
            http::download_file(
                url,
                &vdir.join(format!("{vid}.jar")),
                Some(sha1),
                task,
            )
            .await?;
        }
    }

    if let Some(t) = task {
        t.detail("библиотеки");
    }
    let (_classpath, natives) = download_libraries(&vjson, task).await?;

    if let Some(t) = task {
        t.detail("нативные библиотеки");
    }
    let _ = finalize_natives(vid, &natives);

    if let Some(t) = task {
        t.detail("ресурсы");
    }
    download_assets(&vjson, task).await?;

    if let Some(t) = task {
        t.detail("Java");
    }
    let java = ensure_java(&vjson, task).await?;
    if java.is_none() {
        eprintln!("[java] не найдена — будет использован системный java");
    }

    let _ = app;
    Ok(())
}
