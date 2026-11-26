//! Общий HTTP-клиент и загрузка файлов с sha1 и прогрессом.

use std::path::Path;
use std::sync::LazyLock;

use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;

use crate::tasks::TaskHandle;

pub const USER_AGENT: &str = concat!(
    "MiblLauncher/",
    env!("CARGO_PKG_VERSION"),
    " (local launcher)"
);

pub static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(15))
        .pool_max_idle_per_host(16)
        .build()
        .expect("http client")
});

/// Клиент для больших загрузок (JRE ~40 МБ): без общего 15-секундного лимита.
static LONG_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(1800))
        .pool_max_idle_per_host(16)
        .build()
        .expect("http client")
});

pub fn client() -> &'static reqwest::Client {
    &CLIENT
}

pub async fn get_json(url: &str) -> Result<serde_json::Value, String> {
    let resp = client()
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Сеть: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} — {url}", resp.status()));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("JSON: {e}"))
}

pub async fn get_text(url: &str) -> Result<String, String> {
    let resp = client()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Сеть: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} — {url}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

pub fn sha1_bytes(data: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(data);
    hex(&h.finalize())
}

pub fn file_sha1(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut h = Sha1::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Some(hex(&h.finalize()))
}

pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Скачать файл с проверкой sha1. `sha1` — ожидаемый хеш (hex, нижний регистр).
pub async fn download_file(
    url: &str,
    dest: &Path,
    sha1: Option<&str>,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    download_with(client(), url, dest, sha1, task).await
}

/// Скачать большой файл (например, JRE) без короткого общего таймаута.
pub async fn download_file_long(
    url: &str,
    dest: &Path,
    sha1: Option<&str>,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    download_with(&LONG_CLIENT, url, dest, sha1, task).await
}

async fn download_with(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    sha1: Option<&str>,
    task: Option<&TaskHandle>,
) -> Result<(), String> {
    if let Some(expected) = sha1 {
        if dest.is_file() {
            if let Some(actual) = file_sha1(dest) {
                if actual.eq_ignore_ascii_case(expected) {
                    if let Some(t) = task {
                        t.add(0);
                    }
                    return Ok(());
                }
            }
        }
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Папка {}: {e}", parent.display()))?;
    }

    let tmp = dest.with_extension("part");
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Загрузка {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} — {url}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    if let Some(t) = task {
        t.set_total(total);
    }

    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| format!("Файл {}: {e}", tmp.display()))?;
    let mut stream = resp.bytes_stream();
    let mut hasher = Sha1::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Поток {url}: {e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Запись {}: {e}", tmp.display()))?;
        if let Some(t) = task {
            t.add(chunk.len() as u64);
        }
    }
    file.flush().await.ok();
    drop(file);

    if let Some(expected) = sha1 {
        let actual = hex(&hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!(
                "Ошибка проверки файла {}",
                dest.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
            ));
        }
    }

    let _ = tokio::fs::remove_file(dest).await;
    tokio::fs::rename(&tmp, dest)
        .await
        .map_err(|e| format!("Переименование {}: {e}", dest.display()))?;
    Ok(())
}

/// Скачать в память (иконки, скины).
pub async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let resp = client()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Сеть: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    Ok(resp
        .bytes()
        .await
        .map_err(|e| e.to_string())?
        .to_vec())
}
