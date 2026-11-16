//! Аккаунты: Ely.by и офлайн, локальные скины.

use crate::auth::MicrosoftSession;
use crate::ely::ElySession;
use crate::models::{Account, Accounts};
use crate::paths;

/// Добавить/обновить лицензионный Microsoft-аккаунт и выбрать его.
pub fn upsert_microsoft(session: &MicrosoftSession, skin: Option<String>) -> Result<usize, String> {
    let mut data = load();
    let existing = data.accounts.iter().position(|a| {
        a.kind == "microsoft"
            && (a.uuid.as_deref() == Some(session.uuid.as_str())
                || a.name.eq_ignore_ascii_case(&session.name))
    });

    let index = match existing {
        Some(i) => {
            data.accounts[i].name = session.name.clone();
            data.accounts[i].kind = "microsoft".into();
            data.accounts[i].uuid = Some(session.uuid.clone());
            data.accounts[i].access_token = Some(session.access_token.clone());
            data.accounts[i].refresh_token = Some(session.refresh_token.clone());
            data.accounts[i].expires_at = Some(session.expires_at);
            data.accounts[i].xuid = session.xuid.clone();
            if skin.is_some() {
                data.accounts[i].skin = skin;
            }
            i
        }
        None => {
            data.accounts.push(Account {
                name: session.name.clone(),
                kind: "microsoft".into(),
                skin,
                ely: None,
                uuid: Some(session.uuid.clone()),
                access_token: Some(session.access_token.clone()),
                client_token: None,
                ely_username: None,
                refresh_token: Some(session.refresh_token.clone()),
                expires_at: Some(session.expires_at),
                xuid: session.xuid.clone(),
            });
            data.accounts.len() - 1
        }
    };
    data.selected = index;
    save(&data)?;
    Ok(index)
}

/// Обновить токены существующего Microsoft-аккаунта, сохранив скин.
pub fn update_microsoft(index: usize, session: &MicrosoftSession) -> Result<(), String> {
    let mut data = load();
    if index >= data.accounts.len() {
        return Err("Аккаунт не найден".into());
    }
    data.accounts[index].name = session.name.clone();
    data.accounts[index].kind = "microsoft".into();
    data.accounts[index].uuid = Some(session.uuid.clone());
    data.accounts[index].access_token = Some(session.access_token.clone());
    data.accounts[index].refresh_token = Some(session.refresh_token.clone());
    data.accounts[index].expires_at = Some(session.expires_at);
    data.accounts[index].xuid = session.xuid.clone();
    save(&data)
}
pub fn load() -> Accounts {
    let mut data = std::fs::read_to_string(paths::accounts_path())
        .ok()
        .and_then(|t| serde_json::from_str::<Accounts>(&t).ok())
        .unwrap_or_default();
    if data.accounts.is_empty() {
        data.accounts.push(Account::default());
    }
    if data.selected >= data.accounts.len() {
        data.selected = 0;
    }
    data
}

pub fn save(data: &Accounts) -> Result<(), String> {
    let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(paths::accounts_path(), text).map_err(|e| e.to_string())
}

pub fn current() -> Account {
    load().current()
}

/// Добавить/обновить Ely-аккаунт и сделать его выбранным.
pub fn upsert_ely(session: &ElySession, skin: Option<String>) -> Result<usize, String> {
    let mut data = load();
    let existing = data
        .accounts
        .iter()
        .position(|a| a.ely_username.as_deref() == Some(session.name.as_str()));

    let account = Account {
        name: session.name.clone(),
        kind: "ely".into(),
        skin: skin.clone(),
        ely: Some("ely.by".into()),
        uuid: Some(session.uuid.clone()),
        access_token: Some(session.access_token.clone()),
        client_token: Some(session.client_token.clone()),
        ely_username: Some(session.name.clone()),
        refresh_token: None,
        expires_at: None,
        xuid: None,
    };

    let index = match existing {
        Some(i) => {
            if data.accounts[i].skin.is_none() {
                data.accounts[i].skin = skin;
            }
            data.accounts[i].name = account.name;
            data.accounts[i].kind = account.kind;
            data.accounts[i].ely = account.ely;
            data.accounts[i].uuid = account.uuid;
            data.accounts[i].access_token = account.access_token;
            data.accounts[i].client_token = account.client_token;
            data.accounts[i].ely_username = account.ely_username;
            i
        }
        None => {
            data.accounts.push(account);
            data.accounts.len() - 1
        }
    };
    data.selected = index;
    save(&data)?;
    Ok(index)
}

/// Гостевой аккаунт Ely.by: только ник и скин, без токена.
pub fn upsert_ely_guest(nick: &str, skin: Option<String>) -> Result<usize, String> {
    let mut data = load();
    let index = match data
        .accounts
        .iter()
        .position(|a| a.ely_username.as_deref() == Some(nick))
    {
        Some(i) => {
            data.accounts[i].skin = skin;
            i
        }
        None => {
            data.accounts.push(Account {
                name: nick.to_string(),
                kind: "ely".into(),
                skin,
                ely: Some("ely.by".into()),
                uuid: None,
                access_token: None,
                client_token: None,
                ely_username: Some(nick.to_string()),
                refresh_token: None,
                expires_at: None,
                xuid: None,
            });
            data.accounts.len() - 1
        }
    };
    data.selected = index;
    save(&data)?;
    Ok(index)
}

pub fn upsert_offline(name: &str, skin: Option<String>) -> Result<usize, String> {
    let mut data = load();
    let index = match data
        .accounts
        .iter()
        .position(|a| a.kind == "offline" && a.name.eq_ignore_ascii_case(name))
    {
        Some(i) => {
            data.accounts[i].skin = skin;
            i
        }
        None => {
            data.accounts.push(Account {
                name: name.to_string(),
                kind: "offline".into(),
                skin,
                ..Account::default()
            });
            data.accounts.len() - 1
        }
    };
    data.selected = index;
    save(&data)?;
    Ok(index)
}

/// Сохранить изменённые поля текущего выбранного аккаунта.
pub fn save_current(account: &Account) -> Result<(), String> {
    let mut data = load();
    if data.accounts.is_empty() {
        data.accounts.push(account.clone());
        data.selected = 0;
    } else {
        let idx = data.selected.min(data.accounts.len() - 1);
        data.accounts[idx] = account.clone();
        data.selected = idx;
    }
    save(&data)
}

pub fn set_selected(index: usize) -> Result<(), String> {    let mut data = load();
    if index >= data.accounts.len() {
        return Err("Аккаунт не найден".into());
    }
    data.selected = index;
    save(&data)
}

pub fn remove(index: usize) -> Result<(), String> {
    let mut data = load();
    if data.accounts.len() <= 1 {
        return Err("Нельзя удалить единственный аккаунт".into());
    }
    if index >= data.accounts.len() {
        return Err("Аккаунт не найден".into());
    }
    data.accounts.remove(index);
    if data.selected >= data.accounts.len() {
        data.selected = data.accounts.len() - 1;
    }
    save(&data)
}

pub fn set_skin(index: usize, path: &str) -> Result<(), String> {
    let mut data = load();
    if index >= data.accounts.len() {
        return Err("Аккаунт не найден".into());
    }
    data.accounts[index].skin = Some(path.to_string());
    save(&data)
}

/// Сменить ник офлайн-аккаунта.
pub fn rename(index: usize, name: &str) -> Result<(), String> {
    let mut data = load();
    if index >= data.accounts.len() {
        return Err("Аккаунт не найден".into());
    }
    data.accounts[index].name = name.to_string();
    save(&data)
}
