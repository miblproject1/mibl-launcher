//! Официальный вход Microsoft (лицензия Minecraft).
//!
//! OAuth 2.0 Device Code Flow: Microsoft -> Xbox Live -> XSTS -> Minecraft
//! Services -> профиль Minecraft. Токены хранятся в `accounts.json`, пароль
//! пользователя лаунчер никогда не видит.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http;
use crate::models::Account;
use crate::paths;

/// Официальный client_id лаунчера Minecraft (публичный, без секрета).
pub const CLIENT_ID: &str = "00000000402b5328";
pub const SCOPE: &str = "XboxLive.signin offline_access";

const DEVICE_CODE_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str =
    "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicrosoftSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: f64,
    pub uuid: String,
    pub name: String,
    pub xuid: Option<String>,
    pub skin_url: Option<String>,
}

pub enum PollOutcome {
    Pending,
    SlowDown,
    Ready(MicrosoftSession),
}

fn now_secs() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

async fn form_post(url: &str, fields: &[(&str, &str)]) -> Result<(reqwest::StatusCode, Value), String> {
    let resp = http::client()
        .post(url)
        .header("Accept", "application/json")
        .form(fields)
        .send()
        .await
        .map_err(|e| format!("Сеть Microsoft: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let value = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| {
        json!({ "error_description": text.chars().take(240).collect::<String>() })
    });
    Ok((status, value))
}

fn oauth_error(value: &Value) -> String {
    let code = value.get("error").and_then(|v| v.as_str()).unwrap_or("");
    let description = value
        .get("error_description")
        .and_then(|v| v.as_str())
        .unwrap_or("неизвестная ошибка");
    match code {
        "authorization_pending" => "Ожидаем подтверждение входа в браузере…".into(),
        "slow_down" => "Microsoft просит реже опрашивать статус входа".into(),
        "expired_token" => "Код входа истёк — начните вход заново".into(),
        "authorization_declined" => "Вход через Microsoft отклонён".into(),
        "" => format!("Microsoft: {description}"),
        other => format!("Microsoft ({other}): {description}"),
    }
}

/// Шаг 1: получить код, который пользователь вводит на microsoft.com/link.
pub async fn start_device_code() -> Result<DeviceCode, String> {
    let (status, value) = form_post(
        DEVICE_CODE_URL,
        &[("client_id", CLIENT_ID), ("scope", SCOPE)],
    )
    .await?;
    if !status.is_success() {
        return Err(oauth_error(&value));
    }
    let code: DeviceCode =
        serde_json::from_value(value).map_err(|e| format!("Ответ Microsoft: {e}"))?;
    Ok(code)
}

#[derive(Debug, Deserialize)]
struct XboxTokenResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Debug, Deserialize)]
struct DisplayClaims {
    #[serde(default)]
    xui: Vec<Xui>,
}

#[derive(Debug, Deserialize)]
struct Xui {
    #[serde(default)]
    uhs: String,
    #[serde(default)]
    xid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: String,
    #[serde(default)]
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct McProfile {
    id: String,
    name: String,
    #[serde(default)]
    skins: Vec<McSkin>,
}

#[derive(Debug, Deserialize)]
struct McSkin {
    #[serde(default)]
    url: String,
    #[serde(default)]
    state: String,
}

fn xsts_error(value: &Value) -> String {
    let code = value.get("XErr").and_then(|v| v.as_u64()).unwrap_or(0);
    match code {
        2148916233 => "У аккаунта Microsoft нет профиля Xbox. Создайте его на xbox.com и повторите вход.".into(),
        2148916235 => "Xbox Live недоступен в вашем регионе.".into(),
        2148916236 | 2148916237 => "Аккаунту нужно подтвердить возраст на xbox.com.".into(),
        2148916238 => "Детский аккаунт: добавьте его в семейную группу Microsoft и повторите вход.".into(),
        2148916227 => "Аккаунт Xbox заблокирован.".into(),
        0 => "XSTS отклонил вход. Проверьте профиль Xbox Live.".into(),
        _ => format!("XSTS отклонил вход (код {code})."),
    }
}

async fn xbox_live(ms_access_token: &str) -> Result<(String, String, Option<String>), String> {
    let body = json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={ms_access_token}")
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });
    let resp = http::client()
        .post(XBL_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Xbox Live: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Xbox Live отклонил вход (HTTP {status}): {}",
            text.chars().take(160).collect::<String>()
        ));
    }
    let data: XboxTokenResponse =
        serde_json::from_str(&text).map_err(|e| format!("Ответ Xbox Live: {e}"))?;
    let xui = data
        .display_claims
        .xui
        .into_iter()
        .next()
        .ok_or_else(|| "Xbox Live не вернул профиль пользователя".to_string())?;
    if xui.uhs.is_empty() {
        return Err("Xbox Live не вернул user hash".into());
    }
    Ok((data.token, xui.uhs, xui.xid))
}

async fn xsts(xbl_token: &str) -> Result<String, String> {
    let body = json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });
    let resp = http::client()
        .post(XSTS_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XSTS: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let value: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "raw": text }));
    if !status.is_success() {
        return Err(xsts_error(&value));
    }
    value
        .get("Token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "XSTS не вернул токен".to_string())
}

fn hyphenate_uuid(id: &str) -> String {
    let clean: String = id.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.len() == 32 {
        format!(
            "{}-{}-{}-{}-{}",
            &clean[0..8],
            &clean[8..12],
            &clean[12..16],
            &clean[16..20],
            &clean[20..32]
        )
    } else {
        id.to_string()
    }
}

async fn minecraft_profile(access_token: &str) -> Result<McProfile, String> {
    let resp = http::client()
        .get(MC_PROFILE_URL)
        .header("Accept", "application/json")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Minecraft Services: {e}"))?;
    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(
            "У аккаунта Microsoft нет лицензии Minecraft. Купите игру или войдите другим аккаунтом."
                .into(),
        );
    }
    if !status.is_success() {
        return Err(format!(
            "Minecraft Services вернул HTTP {status}. Возможно, сессия истекла — войдите снова."
        ));
    }
    resp.json::<McProfile>()
        .await
        .map_err(|e| format!("Профиль Minecraft: {e}"))
}

/// Полная цепочка после получения OAuth-токена Microsoft.
async fn authenticate_minecraft(
    ms_access_token: &str,
    refresh_token: &str,
) -> Result<MicrosoftSession, String> {
    let (xbl_token, uhs, xuid) = xbox_live(ms_access_token).await?;
    let xsts_token = xsts(&xbl_token).await?;

    let body = json!({
        "identityToken": format!("XBL3.0 x={uhs};{xsts_token}")
    });
    let resp = http::client()
        .post(MC_LOGIN_URL)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Minecraft Services: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Не удалось войти в Minecraft (HTTP {status}): {}",
            text.chars().take(200).collect::<String>()
        ));
    }
    let login: McLoginResponse =
        serde_json::from_str(&text).map_err(|e| format!("Ответ Minecraft Services: {e}"))?;

    let profile = minecraft_profile(&login.access_token).await?;
    let skin_url = profile
        .skins
        .iter()
        .find(|skin| skin.state.eq_ignore_ascii_case("ACTIVE"))
        .or_else(|| profile.skins.first())
        .map(|skin| skin.url.clone())
        .filter(|url| !url.is_empty());

    Ok(MicrosoftSession {
        access_token: login.access_token,
        refresh_token: refresh_token.to_string(),
        expires_at: now_secs() + login.expires_in.max(3600) as f64,
        uuid: hyphenate_uuid(&profile.id),
        name: profile.name,
        xuid,
        skin_url,
    })
}

/// Шаг 2: опросить статус после того, как пользователь ввёл код.
pub async fn poll_device_code(device_code: &str) -> Result<PollOutcome, String> {
    let (status, value) = form_post(
        TOKEN_URL,
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ],
    )
    .await?;

    if !status.is_success() {
        match value.get("error").and_then(|v| v.as_str()) {
            Some("authorization_pending") => return Ok(PollOutcome::Pending),
            Some("slow_down") => return Ok(PollOutcome::SlowDown),
            _ => return Err(oauth_error(&value)),
        }
    }

    let access_token = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Microsoft не вернул access_token".to_string())?;
    let refresh_token = value
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let session = authenticate_minecraft(access_token, &refresh_token).await?;
    Ok(PollOutcome::Ready(session))
}

/// Обновить истёкший Minecraft-токен по refresh_token.
pub async fn refresh_session(refresh_token: &str) -> Result<MicrosoftSession, String> {
    let (status, value) = form_post(
        TOKEN_URL,
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", SCOPE),
        ],
    )
    .await?;
    if !status.is_success() {
        return Err(format!(
            "Сессия Microsoft истекла — войдите заново. {}",
            oauth_error(&value)
        ));
    }
    let access_token = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Microsoft не вернул access_token".to_string())?;
    let new_refresh = value
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or(refresh_token)
        .to_string();
    authenticate_minecraft(access_token, &new_refresh).await
}

/// Актуальная сессия Microsoft для запуска игры.
pub async fn ensure_fresh(account: &Account) -> Result<Account, String> {
    if account.kind != "microsoft" {
        return Ok(account.clone());
    }
    if account
        .access_token
        .as_deref()
        .map(|token| token.is_empty())
        .unwrap_or(true)
    {
        return Err("Microsoft-аккаунт не авторизован — войдите заново".to_string());
    }
    let valid = account
        .expires_at
        .map(|expires| expires > now_secs() + 120.0)
        .unwrap_or(true);
    if valid {
        return Ok(account.clone());
    }
    let refresh = account
        .refresh_token
        .clone()
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Сессия Microsoft истекла — войдите заново".to_string())?;
    let session = refresh_session(&refresh).await?;
    let mut updated = account.clone();
    updated.access_token = Some(session.access_token);
    updated.refresh_token = Some(session.refresh_token);
    updated.expires_at = Some(session.expires_at);
    updated.name = session.name;
    updated.uuid = Some(session.uuid);
    updated.xuid = session.xuid;
    Ok(updated)
}

/// Скачать официальный скин Mojang в локальную папку `skins`.
pub async fn download_skin(session: &MicrosoftSession) -> Option<String> {
    let url = session.skin_url.as_deref()?;
    let bytes = http::fetch_bytes(url).await.ok()?;
    if bytes.len() < 64 {
        return None;
    }
    let dir = paths::skins_dir();
    std::fs::create_dir_all(&dir).ok()?;
    let dest = dir.join(format!("{}.png", paths::safe_name(&session.name)));
    std::fs::write(&dest, bytes).ok()?;
    Some(dest.to_string_lossy().to_string())
}
