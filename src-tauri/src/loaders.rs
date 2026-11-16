//! Установка модлоадеров: Fabric, Quilt, Forge, NeoForge.

use std::path::PathBuf;

use serde_json::Value;
use tauri::AppHandle;

use crate::http;
use crate::install;
use crate::paths;
use crate::tasks::TaskHandle;
use crate::version;

pub const FABRIC_META: &str = "https://meta.fabricmc.net/v2/versions/loader";
pub const QUILT_META: &str = "https://meta.quiltmc.org/v3/versions/loader";
pub const FORGE_PROMOS: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
pub const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
pub const NEO_MAVEN: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";
pub const NEO_VERSIONS: &str =
    "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";

pub fn save_version_json(vid: &str, data: &Value) -> Result<String, String> {
    let dir = paths::versions_dir().join(vid);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{vid}.json")), text).map_err(|e| e.to_string())?;
    Ok(vid.to_string())
}

fn ver_key(v: &str) -> Vec<u64> {
    v.replace('-', ".")
        .split('.')
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .collect()
}

async fn neoforge_versions(mc_version: &str) -> Vec<String> {
    let data = match http::get_json(NEO_VERSIONS).await {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let list = data
        .get("versions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let prefix = if mc_version == "1.20.1" {
        "47.1.".to_string()
    } else {
        let parts: Vec<&str> = mc_version.split('.').collect();
        if parts.len() >= 3 {
            format!("{}.{}.", parts[1], parts[2])
        } else if parts.len() == 2 {
            format!("{}.0.", parts[1])
        } else {
            format!("{mc_version}.")
        }
    };

    let mut out: Vec<String> = list
        .iter()
        .filter_map(|v| v.as_str())
        .filter(|v| v.starts_with(&prefix))
        .map(|v| v.to_string())
        .collect();
    out.sort_by(|a, b| ver_key(b).cmp(&ver_key(a)));
    out
}

pub async fn loader_versions(mc_version: &str, loader: &str) -> Vec<String> {
    match loader {
        "fabric" => match http::get_json(&format!("{FABRIC_META}/{mc_version}")).await {
            Ok(data) => data
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| {
                            x.get("loader")
                                .and_then(|l| l.get("version"))
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                        .collect()
                })
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        },
        "quilt" => match http::get_json(&format!("{QUILT_META}/{mc_version}")).await {
            Ok(data) => data
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| {
                            x.get("loader")
                                .and_then(|l| l.get("version"))
                                .and_then(|v| v.as_str())
                                .map(String::from)
                        })
                        .collect()
                })
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        },
        "forge" => {
            let Ok(promos) = http::get_json(FORGE_PROMOS).await else {
                return Vec::new();
            };
            let promos = promos.get("promos").cloned().unwrap_or(Value::Null);
            let mut out: Vec<String> = Vec::new();
            for kind in ["recommended", "latest"] {
                let key = format!("{mc_version}-{kind}");
                if let Some(v) = promos.get(&key).and_then(|v| v.as_str()) {
                    if !out.iter().any(|x| x == v) {
                        out.push(v.to_string());
                    }
                }
            }
            out
        }
        "neoforge" => neoforge_versions(mc_version).await,
        _ => Vec::new(),
    }
}

/// Доустановить базовую версию Minecraft, если её нет.
async fn ensure_vanilla(
    app: &AppHandle,
    mc_version: &str,
    task: Option<&TaskHandle>,
) -> Result<Value, String> {
    let versions = version::fetch_manifest().await?;
    let entry = versions
        .iter()
        .find(|v| v.id == mc_version)
        .cloned()
        .ok_or_else(|| format!("Версия Minecraft {mc_version} не найдена в манифесте Mojang"))?;

    let jar = paths::versions_dir()
        .join(mc_version)
        .join(format!("{mc_version}.jar"));
    let json = version::version_json_path(mc_version);
    if !json.is_file() || !jar.is_file() {
        if let Some(t) = task {
            t.detail(format!("Базовая версия {mc_version}"));
        }
        install::install_version(app, mc_version, &entry.url, task).await?;
    }
    Ok(serde_json::json!({ "url": entry.url, "id": entry.id }))
}

async fn installer_java(entry: &Value, mc_version: &str) -> Option<String> {
    let url = entry.get("url").and_then(|v| v.as_str())?;
    let vjson = http::get_json(url).await.ok()?;
    if let Ok(Some(java)) = install::ensure_java(&vjson, None).await {
        return Some(java);
    }
    // Резерв: подобрать/скачать Temurin нужной мажорной версии.
    crate::java::ensure_java(mc_version, None).await.ok()
}

async fn run_installer(
    url: &str,
    filename: &str,
    java: &str,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(filename);
    if !tmp.is_file() {
        if let Some(t) = task {
            t.detail("Загрузка установщика");
        }
        http::download_file(url, &tmp, None, None).await?;
    }
    if let Some(t) = task {
        t.detail("Запуск установщика (1–3 минуты)");
    }
    let java_home = PathBuf::from(java)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());

    let mut cmd = tokio::process::Command::new(java);
    cmd.arg("-jar")
        .arg(&tmp)
        .arg("--installClient")
        .arg(paths::data_dir());
    if let Some(home) = java_home {
        cmd.env("JAVA_HOME", home);
    }
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    // Windows: установщик не должен открывать чёрное окно консоли.
    crate::proc::hide_console(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Не удалось запустить установщик: {e}"))?;
    if !output.status.success() {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let tail: Vec<&str> = text.lines().rev().take(12).collect();
        let tail = tail.into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!(
            "Установщик вернул ошибку {}:\n{tail}",
            output.status.code().unwrap_or(-1)
        ));
    }
    Ok(())
}

fn find_version_dir(prefix: &str) -> Option<String> {
    let dir = paths::versions_dir();
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(prefix) {
            return Some(name);
        }
    }
    None
}

/// Официальные установщики Forge/NeoForge требуют `launcher_profiles.json`
/// и в корне данных лаунчера, и в игровой папке сборки.
fn prepare_launcher_profiles(instance: Option<&str>) -> Result<(), String> {
    paths::ensure_launcher_profiles(&paths::data_dir())
        .map_err(|e| format!("Не удалось создать launcher_profiles.json: {e}"))?;
    if let Some(name) = instance.filter(|name| !name.trim().is_empty()) {
        paths::ensure_launcher_profiles(&paths::game_dir(name))
            .map_err(|e| format!("Не удалось создать launcher_profiles.json сборки: {e}"))?;
    }
    Ok(())
}

/// Установить базовую версию + модлоадер. Возвращает id версии для запуска.
pub async fn install_loader(
    app: &AppHandle,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    instance: Option<&str>,
    task: Option<&TaskHandle>,
) -> Result<String, String> {
    let entry = ensure_vanilla(app, mc_version, task).await?;

    if matches!(loader, "" | "vanilla") {
        return Ok(mc_version.to_string());
    }

    match loader {
        "fabric" | "quilt" => {
            let (base, default_prefix) = if loader == "fabric" {
                (FABRIC_META, "fabric-loader")
            } else {
                (QUILT_META, "quilt-loader")
            };
            let lv = match loader_version {
                Some(v) if !v.is_empty() => v.to_string(),
                _ => loader_versions(mc_version, loader)
                    .await
                    .into_iter()
                    .next()
                    .ok_or_else(|| format!("Нет версий {loader} для {mc_version}"))?,
            };
            if let Some(t) = task {
                t.detail(format!("{loader} {lv}"));
            }
            let url = format!("{base}/{mc_version}/{lv}/profile/json");
            let profile = http::get_json(&url)
                .await
                .map_err(|e| format!("Профиль {loader}: {e}"))?;
            let vid = profile
                .get("id")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| format!("{default_prefix}-{lv}-{mc_version}"));
            save_version_json(&vid, &profile)?;
            finish_profile(&vid, task).await?;
            Ok(vid)
        }
        "forge" => {
            let lv = match loader_version {
                Some(v) if !v.is_empty() => v.to_string(),
                _ => loader_versions(mc_version, "forge")
                    .await
                    .into_iter()
                    .next()
                    .ok_or_else(|| format!("Нет версий Forge для {mc_version}"))?,
            };
            let vid = format!("{mc_version}-forge-{lv}");
            if version::version_json_path(&vid).is_file() {
                // Профиль уже установлен — обновим нативы из всей цепочки.
                let _ = install::prepare_natives(&vid, task).await;
                return Ok(vid);
            }
            let java = installer_java(&entry, mc_version)
                .await
                .ok_or_else(|| "Для установки Forge нужна Java".to_string())?;
            let url = format!("{FORGE_MAVEN}/{mc_version}-{lv}/forge-{mc_version}-{lv}-installer.jar");
            let filename = format!("forge-{mc_version}-{lv}-installer.jar");
            prepare_launcher_profiles(instance)?;
            run_installer(&url, &filename, &java, task).await?;
            let vid = if version::version_json_path(&vid).is_file() {
                vid
            } else {
                find_version_dir(&format!("{mc_version}-forge"))
                    .ok_or_else(|| "Forge установлен, но файл версии не найден".to_string())?
            };
            finish_profile(&vid, task).await?;
            Ok(vid)
        }
        "neoforge" => {
            let lv = match loader_version {
                Some(v) if !v.is_empty() => v.to_string(),
                _ => loader_versions(mc_version, "neoforge")
                    .await
                    .into_iter()
                    .next()
                    .ok_or_else(|| format!("Нет версий NeoForge для {mc_version}"))?,
            };
            let vid = format!("neoforge-{lv}");
            if version::version_json_path(&vid).is_file() {
                // Профиль уже установлен — обновим нативы из всей цепочки.
                let _ = install::prepare_natives(&vid, task).await;
                return Ok(vid);
            }
            let java = installer_java(&entry, mc_version)
                .await
                .ok_or_else(|| "Для установки NeoForge нужна Java".to_string())?;
            let url = format!("{NEO_MAVEN}/{lv}/neoforge-{lv}-installer.jar");
            let filename = format!("neoforge-{lv}-installer.jar");
            prepare_launcher_profiles(instance)?;
            run_installer(&url, &filename, &java, task).await?;
            let vid = if version::version_json_path(&vid).is_file() {
                vid
            } else {
                find_version_dir("neoforge-")
                    .ok_or_else(|| "NeoForge установлен, но файл версии не найден".to_string())?
            };
            finish_profile(&vid, task).await?;
            Ok(vid)
        }
        _ => Ok(mc_version.to_string()),
    }
}

/// Докачать библиотеки/ресурсы/Java для созданного профиля.
async fn finish_profile(vid: &str, task: Option<&TaskHandle>) -> Result<(), String> {
    // Даём игре и профилю немного времени/файлов: библиотеки тянутся при запуске,
    // но прогресс в UI должен быть честным — качаем сразу.
    let merged = match version::resolve_version(vid) {
        Ok((merged, _root)) => merged,
        Err(_) => return Ok(()),
    };
    if let Some(t) = task {
        t.detail("Библиотеки модлоадера");
    }
    install::download_libraries(&merged, task).await?;
    if let Some(t) = task {
        t.detail("Нативные библиотеки");
    }
    // Распаковываем .dll из всей цепочки inheritsFrom в единую папку версии.
    let natives = install::prepare_natives(vid, task).await?;
    if let Some(t) = task {
        t.detail(format!("Нативы: {}", natives.display()));
    }
    if let Some(t) = task {
        t.detail("Ресурсы");
    }
    install::download_assets(&merged, task).await?;
    Ok(())
}
