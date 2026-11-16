//! Ely.by: авторизация, скины и плащи.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::http;
use crate::paths;

pub const AUTH_URL: &str = "https://authserver.ely.by/auth";
pub const SKINS_URL: &str = "https://skinsystem.ely.by/skins";
pub const TEXTURES_URL: &str = "https://skinsystem.ely.by/textures";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElySession {
    pub access_token: String,
    pub client_token: String,
    pub uuid: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct AuthResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "clientToken")]
    client_token: String,
    #[serde(rename = "selectedProfile")]
    selected_profile: Option<Profile>,
}

#[derive(Debug, Deserialize)]
struct Profile {
    id: String,
    name: String,
}

fn api_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        for key in ["errorMessage", "error", "message"] {
            if let Some(msg) = v.get(key).and_then(|m| m.as_str()) {
                if !msg.is_empty() {
                    return match status.as_u16() {
                        401 | 403 => format!("Неверный логин или пароль Ely.by ({msg})"),
                        404 => "Аккаунт Ely.by не найден".to_string(),
                        _ => format!("Ely.by: {msg}"),
                    };
                }
            }
        }
    }
    match status.as_u16() {
        401 | 403 => "Неверный логин или пароль Ely.by".to_string(),
        404 => "Аккаунт Ely.by не найден".to_string(),
        _ => format!("Ely.by вернул HTTP {status}"),
    }
}

pub async fn login(username: &str, password: &str, client_token: Option<&str>) -> Result<ElySession, String> {
    let token = client_token
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let body = json!({
        "username": username,
        "password": password,
        "clientToken": token,
        "agent": { "name": "Minecraft", "version": 1 }
    });

    let resp = http::client()
        .post(format!("{AUTH_URL}/authenticate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Сеть Ely.by: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(api_error(status, &text));
    }
    let data: AuthResponse =
        serde_json::from_str(&text).map_err(|e| format!("Ответ Ely.by: {e}"))?;
    let profile = data
        .selected_profile
        .ok_or_else(|| "У аккаунта Ely.by нет выбранного профиля".to_string())?;

    Ok(ElySession {
        access_token: data.access_token,
        client_token: data.client_token,
        uuid: profile.id,
        name: profile.name,
    })
}

pub async fn refresh(session: &ElySession) -> Result<ElySession, String> {
    let body = json!({
        "accessToken": session.access_token,
        "clientToken": session.client_token,
    });
    let resp = http::client()
        .post(format!("{AUTH_URL}/refresh"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Сеть Ely.by: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(api_error(status, &text));
    }
    let data: AuthResponse =
        serde_json::from_str(&text).map_err(|e| format!("Ответ Ely.by: {e}"))?;
    let profile = data
        .selected_profile
        .ok_or_else(|| "Ely.by не вернул профиль".to_string())?;
    Ok(ElySession {
        access_token: data.access_token,
        client_token: data.client_token,
        uuid: profile.id,
        name: profile.name,
    })
}

fn urlencode_nick(nick: &str) -> String {
    let mut out = String::new();
    for b in nick.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Скачать скин Ely.by в `%AppData%\MiblLauncher\skins\<nick>.png`.
pub async fn download_skin(nick: &str) -> Result<std::path::PathBuf, String> {
    let url = format!("{SKINS_URL}/{}.png", urlencode_nick(nick));
    let bytes = http::fetch_bytes(&url)
        .await
        .map_err(|_| format!("У игрока {nick} нет скина Ely.by"))?;
    if bytes.len() < 100 {
        return Err(format!("У игрока {nick} нет скина Ely.by"));
    }
    let dir = paths::skins_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("{}.png", paths::safe_name(nick)));
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    Ok(dest)
}

pub async fn textures(nick: &str) -> Option<serde_json::Value> {
    let url = format!("{TEXTURES_URL}/{}", urlencode_nick(nick));
    http::get_json(&url).await.ok()
}

pub fn skin_data_url(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 20 {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// `-javaagent:` аргумент для authlib-injector (скины и плащи Ely.by в игре).
pub async fn ensure_authlib_injector() -> Result<std::path::PathBuf, String> {
    let jar = paths::runtime_dir().join("authlib-injector.jar");
    if jar.is_file() {
        return Ok(jar);
    }
    let release = http::get_json(
        "https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest",
    )
    .await
    .map_err(|e| format!("authlib-injector: {e}"))?;

    let assets = release
        .get("assets")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();

    let mut url: Option<String> = None;
    for asset in assets {
        let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or_default();
        if name.ends_with(".jar") && name.contains("authlib-injector") {
            url = asset
                .get("browser_download_url")
                .and_then(|u| u.as_str())
                .map(String::from);
            break;
        }
    }
    let url = url.ok_or_else(|| "Не найден файл authlib-injector.jar в релизе GitHub".to_string())?;
    http::download_file(&url, &jar, None, None).await?;
    Ok(jar)
}
