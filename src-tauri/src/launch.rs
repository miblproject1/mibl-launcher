//! Формирование аргументов и запуск Minecraft (модлоадеры, Ely.by, Quick Play).

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use md5::{Digest, Md5};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::accounts;
use crate::auth;
use crate::crash;
use crate::ely;
use crate::install;
use crate::instances;
use crate::java as java_runtime;
use crate::models::{Instance, LaunchInfo};
use crate::paths;
use crate::store;
use crate::tasks::TaskHandle;
use crate::version;

/// UUID офлайн-игрока — точно как в Python-версии (MD5, v3, RFC 4122).
pub fn offline_uuid(name: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{name}").as_bytes());
    let digest = hasher.finalize();
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest);
    bytes[6] = (bytes[6] & 0x0F) | 0x30;
    bytes[8] = (bytes[8] & 0x3F) | 0x80;
    uuid::Uuid::from_bytes(bytes).to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct GameExit {
    pub instance: String,
    pub code: Option<i32>,
    pub seconds: u64,
    pub ok: bool,
    pub report: Option<crate::models::CrashReport>,
}

pub struct Prepared {
    pub command: Vec<String>,
    pub game_dir: PathBuf,
    pub instance: Instance,
}

/// На Windows для запуска игры предпочитаем javaw.exe: он не создаёт окно
/// консоли. Если javaw.exe нет рядом с java.exe, остаётся java.exe — окно
/// в любом случае скрывается флагом `CREATE_NO_WINDOW`.
fn prefer_javaw(java: &str) -> String {
    let path = std::path::Path::new(java);
    let is_java = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("java.exe"))
        .unwrap_or(false);
    if !is_java {
        return java.to_string();
    }
    let javaw = path.with_file_name("javaw.exe");
    if javaw.is_file() {
        javaw.to_string_lossy().to_string()
    } else {
        java.to_string()
    }
}

/// Убрать из аргументов устаревшие/относительные пути к нативам.
///
/// В старых профилях Forge (1.12.2) `arguments.jvm` вообще отсутствует, а в
/// новых может остаться чужой `${natives_directory}`. Мы всегда добавляем
/// собственный точный абсолютный `-Djava.library.path=...`.
fn strip_native_paths(args: &mut Vec<String>) {
    let mut out = Vec::with_capacity(args.len());
    let mut skip_next = false;
    for arg in std::mem::take(args) {
        if skip_next {
            skip_next = false;
            continue;
        }
        if arg == "-Djava.library.path" || arg == "-Dorg.lwjgl.librarypath" {
            skip_next = true;
            continue;
        }
        if arg.starts_with("-Djava.library.path=")
            || arg.starts_with("-Dorg.lwjgl.librarypath=")
        {
            continue;
        }
        out.push(arg);
    }
    *args = out;
}

/// Записать выбранный язык в `options.txt` сборки, сохранив остальные настройки.
/// Это избавляет от «красного экрана Mojang» при первом запуске: игра сразу
/// стартует с нужной локализацией, без перезапуска.
fn write_game_language(game_dir: &std::path::Path, language: &str) {
    let lang = if language.trim().is_empty() {
        "ru_ru"
    } else {
        language.trim()
    };
    let file = game_dir.join("options.txt");
    let existing = std::fs::read_to_string(&file).unwrap_or_default();
    let mut lines: Vec<String> = existing
        .lines()
        .filter(|line| !line.trim_start().starts_with("lang:"))
        .map(|line| line.to_string())
        .collect();
    if lines.is_empty() {
        // Минимальный набор опций, чтобы игра не считала файл повреждённым.
        lines.push("version:3465".to_string());
    }
    lines.push(format!("lang:{lang}"));
    let _ = std::fs::write(&file, format!("{}\n", lines.join("\n")));
}

pub async fn prepare(
    app: &AppHandle,
    instance_name: &str,
    task: Option<&TaskHandle>,
) -> Result<Prepared, String> {
    let meta = instances::load(instance_name)
        .ok_or_else(|| format!("Сборка «{instance_name}» не найдена"))?;
    let vid = meta
        .version_id
        .clone()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("Сборка «{}» ещё не установлена", meta.name))?;

    let (merged, root_id) = version::resolve_version(&vid)?;
    let config = store::load_config();

    // Ручной путь: сначала настройки конкретной сборки, затем глобальные.
    let mut java = meta.java_path.trim().to_string();
    if java.is_empty() {
        java = config.java_path.trim().to_string();
    }
    if java.is_empty() || !std::path::Path::new(&java).is_file() {
        if let Some(t) = task {
            t.detail(format!(
                "Подбор Java {} для Minecraft {}",
                java_runtime::required_major(&meta.mc_version),
                meta.mc_version
            ));
        }
        java = java_runtime::ensure_java(&meta.mc_version, task).await?;
    }
    if java.is_empty() {
        return Err(
            "Не удалось подобрать Java. Установите Java с https://adoptium.net/ или укажите путь в настройках сборки."
                .into(),
        );
    }
    let java = prefer_javaw(&java);

    let gamedir = paths::game_dir(&meta.name);
    for sub in [
        "mods",
        "resourcepacks",
        "shaderpacks",
        "saves",
        "logs",
        "config",
        "crash-reports",
    ] {
        let _ = std::fs::create_dir_all(gamedir.join(sub));
    }

    // Язык игры до запуска: пишем в options.txt сборки.
    let language = if meta.game_language.trim().is_empty() {
        config.game_language.clone()
    } else {
        meta.game_language.clone()
    };
    write_game_language(&gamedir, &language);

    if let Some(t) = task {
        t.detail("Библиотеки");
    }
    let (classpath, native_jars) = install::download_libraries(&merged, task).await?;
    // Нативы собираем из всей цепочки inheritsFrom (лоадер + ванильный родитель)
    // в одну папку версии и всегда передаём её абсолютный путь в JVM.
    let natives_dir = match install::prepare_natives(&vid, task).await {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[natives] {vid}: {e}");
            install::finalize_natives(&vid, &native_jars)?
        }
    };

    let client_jar = paths::versions_dir()
        .join(&root_id)
        .join(format!("{root_id}.jar"));
    let mut cp_parts: Vec<String> = Vec::new();
    cp_parts.push(client_jar.to_string_lossy().to_string());
    for path in &classpath {
        if path.is_file() {
            cp_parts.push(path.to_string_lossy().to_string());
        }
    }
    let cp = cp_parts.join(";");

    let mut account = accounts::current();
    // Лицензионный Microsoft-аккаунт: проверяем/обновляем токен до запуска.
    if account.kind == "microsoft" {
        if let Some(t) = task {
            t.detail("Проверка лицензии Microsoft");
        }
        let refreshed = auth::ensure_fresh(&account).await?;
        if refreshed.access_token != account.access_token
            || refreshed.expires_at != account.expires_at
            || refreshed.refresh_token != account.refresh_token
        {
            accounts::save_current(&refreshed)?;
        }
        account = refreshed;
    }

    let username = if account.name.trim().is_empty() {
        "Player".to_string()
    } else {
        account.name.clone()
    };
    let is_microsoft = account.kind == "microsoft" && account.access_token.is_some();
    let is_ely_authed = account.kind == "ely" && account.access_token.is_some();
    let acc_uuid = account
        .uuid
        .clone()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| offline_uuid(&username));
    let token = if is_microsoft || is_ely_authed {
        account.access_token.clone().unwrap_or_default()
    } else {
        "0".to_string()
    };

    let assets_index = merged
        .get("assetIndex")
        .and_then(|a| a.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("legacy")
        .to_string();

    let mut variables: HashMap<String, String> = HashMap::new();
    variables.insert("auth_player_name".into(), username.clone());
    variables.insert("version_name".into(), vid.clone());
    variables.insert(
        "game_directory".into(),
        gamedir.to_string_lossy().to_string(),
    );
    variables.insert(
        "assets_root".into(),
        paths::assets_dir().to_string_lossy().to_string(),
    );
    variables.insert("assets_index_name".into(), assets_index);
    variables.insert("auth_uuid".into(), acc_uuid);
    variables.insert("auth_access_token".into(), token);
    variables.insert(
        "clientid".into(),
        if is_microsoft {
            auth::CLIENT_ID.to_string()
        } else {
            "0".into()
        },
    );
    variables.insert(
        "auth_xuid".into(),
        account
            .xuid
            .clone()
            .filter(|x| !x.is_empty())
            .unwrap_or_else(|| "0".into()),
    );
    variables.insert(
        "user_type".into(),
        if is_microsoft {
            "msa"
        } else if is_ely_authed {
            "mojang"
        } else {
            "legacy"
        }
        .into(),
    );
    variables.insert(
        "version_type".into(),
        merged
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("release")
            .to_string(),
    );
    variables.insert(
        "natives_directory".into(),
        natives_dir.to_string_lossy().to_string(),
    );
    variables.insert("launcher_name".into(), "MiblLauncher".into());
    variables.insert("launcher_version".into(), env!("CARGO_PKG_VERSION").into());
    variables.insert("classpath".into(), cp.clone());
    variables.insert("classpath_separator".into(), ";".into());
    variables.insert(
        "library_directory".into(),
        paths::data_dir().join("libraries").to_string_lossy().to_string(),
    );
    variables.insert(
        "primary_jar".into(),
        client_jar.to_string_lossy().to_string(),
    );

    let jvm_template = merged
        .get("arguments")
        .and_then(|a| a.get("jvm"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let game_template = merged
        .get("arguments")
        .and_then(|a| a.get("game"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut jvm_args = version::expand_args(&jvm_template, &variables);
    let mut game_args = version::expand_args(&game_template, &variables);
    if game_args.is_empty() {
        if let Some(legacy) = merged.get("minecraftArguments").and_then(|v| v.as_str()) {
            game_args = legacy
                .split_whitespace()
                .map(|part| version::expand(part, &variables))
                .collect();
        }
    }
    if !jvm_args.iter().any(|a| a == "-cp" || a == "-classpath") {
        jvm_args.push("-cp".into());
        jvm_args.push(cp.clone());
    }

    // Гарантируем точный абсолютный путь к нативам даже для legacy-профилей,
    // где `arguments.jvm` отсутствует (Forge 1.12.2, RLCraft и т.п.).
    strip_native_paths(&mut jvm_args);
    let natives_path = natives_dir.to_string_lossy().to_string();
    jvm_args.insert(0, format!("-Djava.library.path={natives_path}"));
    jvm_args.insert(1, format!("-Dorg.lwjgl.librarypath={natives_path}"));

    let ram = meta.ram_mb.clamp(512, 65536);
    let mut command: Vec<String> = Vec::new();
    command.push(java);
    command.push(format!("-Xmx{ram}M"));
    command.push(format!("-Xms{}M", (ram / 2).max(512)));
    command.push("-Dfile.encoding=UTF-8".into());
    command.push("-XX:+IgnoreUnrecognizedVMOptions".into());
    command.push("-Dminecraft.launcher.brand=MiblLauncher".into());
    command.push(format!(
        "-Dminecraft.launcher.version={}",
        env!("CARGO_PKG_VERSION")
    ));
    command.extend(config.jvm_args.iter().cloned());
    command.extend(meta.jvm_args.iter().cloned());

    if is_ely_authed {
        if let Some(t) = task {
            t.detail("authlib-injector (скины Ely.by)");
        }
        match ely::ensure_authlib_injector().await {
            Ok(jar) => command.push(format!("-javaagent:{}=ely.by", jar.to_string_lossy())),
            Err(e) => eprintln!("[authlib-injector] {e}"),
        }
        // токен мог истечь — пробуем обновить
        if let (Some(token), Some(client)) = (&account.access_token, &account.client_token) {
            let session = ely::ElySession {
                access_token: token.clone(),
                client_token: client.clone(),
                uuid: account.uuid.clone().unwrap_or_default(),
                name: username.clone(),
            };
            if let Ok(fresh) = ely::refresh(&session).await {
                let _ = accounts::upsert_ely(&fresh, account.skin.clone());
            }
        }
    }

    command.extend(jvm_args);

    let main_class = merged
        .get("mainClass")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "В описании версии отсутствует mainClass".to_string())?;
    command.push(main_class.to_string());
    command.extend(game_args);

    // Quick Play: сразу в мир или на сервер, минуя главное меню.
    let target = meta.quick_play_target.trim().to_string();
    if !target.is_empty() {
        match meta.quick_play_mode.as_str() {
            "singleplayer" => {
                command.push("--quickPlaySingleplayer".into());
                command.push(target);
            }
            "multiplayer" => {
                command.push("--quickPlayMultiplayer".into());
                command.push(target);
            }
            _ => {}
        }
    }

    let _ = app;
    Ok(Prepared {
        command,
        game_dir: gamedir,
        instance: meta,
    })
}

fn preview(command: &[String]) -> String {
    let mut out = String::new();
    for (i, part) in command.iter().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        if part.contains(' ') {
            out.push('"');
            out.push_str(part);
            out.push('"');
        } else {
            out.push_str(part);
        }
        if out.len() > 900 {
            out.push_str(" …");
            break;
        }
    }
    out
}

/// Запуск игры в фоне. Возвращает краткую информацию сразу после подготовки.
pub async fn launch(
    app: &AppHandle,
    instance_name: &str,
    task: Option<&TaskHandle>,
) -> Result<LaunchInfo, String> {
    let prepared = prepare(app, instance_name, task).await?;
    let mut meta = prepared.instance.clone();
    meta.last_played = instances::now();
    let _ = instances::save(&meta);

    let mut cmd = tokio::process::Command::new(&prepared.command[0]);
    cmd.args(&prepared.command[1..])
        .current_dir(&prepared.game_dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    // Windows: без чёрного окна консоли, но в отдельной группе процессов.
    crate::proc::hide_console_new_group(&mut cmd);

    if let Some(t) = task {
        t.detail("Игра запускается");
    }

    // Автосворачивание: не мешаем игре и разворачиваем окно после её закрытия.
    let launch_config = store::load_config();
    let window = if launch_config.auto_minimize {
        app.get_webview_window("main")
    } else {
        None
    };
    if let Some(win) = &window {
        let _ = win.minimize();
    }

    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => {
            if let Some(win) = &window {
                let _ = win.unminimize();
            }
            return Err(format!("Не удалось запустить игру: {error}"));
        }
    };

    let info = LaunchInfo {
        instance: prepared.instance.name.clone(),
        java: prepared.command[0].clone(),
        arg_count: prepared.command.len(),
        command_preview: preview(&prepared.command),
    };

    let app2 = app.clone();
    let window2 = window.clone();
    let name = prepared.instance.name.clone();
    let args = prepared.command.clone();
    let _ = app.emit(
        "game-start",
        serde_json::json!({
            "instance": name,
            "java": info.java,
            "args": args.len(),
        }),
    );

    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let mut child = child;
        let status = child.wait().await;
        let seconds = started.elapsed().as_secs();
        instances::add_playtime(&name, seconds);

        if let Some(win) = &window2 {
            let _ = win.unminimize();
            let _ = win.set_focus();
        }

        let code = status.ok().and_then(|s| s.code());
        let ok = code == Some(0) || code.is_none();
        let report = if ok {
            None
        } else {
            Some(crash::analyze(&name, code))
        };

        let payload = GameExit {
            instance: name,
            code,
            seconds,
            ok,
            report,
        };
        let _ = app2.emit("game-exit", payload);
    });

    Ok(info)
}
