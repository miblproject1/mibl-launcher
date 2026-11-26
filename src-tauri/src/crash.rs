//! Анализ логов и crash-report'ов: понятное объяснение причин на русском.

use std::path::{Path, PathBuf};

use crate::models::{CrashCause, CrashReport};
use crate::paths;

struct Rule {
    keys: &'static [&'static str],
    title: &'static str,
    detail: &'static str,
}

const RULES: &[Rule] = &[
    Rule {
        keys: &[
            "java.lang.OutOfMemoryError",
            "outofmemoryerror",
            "GC overhead limit exceeded",
        ],
        title: "Не хватает оперативной памяти",
        detail: "Игра не умеет выделить достаточно ОЗУ. Увеличьте объём памяти в настройках сборки (например, 4096 МБ) и закройте лишние программы.",
    },
    Rule {
        keys: &[
            "UnsupportedClassVersionError",
            "class file version",
            "has been compiled by a more recent version",
        ],
        title: "Неподходящая версия Java",
        detail: "Мод или игра собраны под другую версию Java. Для 1.17+ нужна Java 17, для 1.20.5+ — Java 21, для 26.x — Java 25. Удалите свой путь к Java в настройках, чтобы лаунчер скачал правильную версию.",
    },
    Rule {
        keys: &[
            "Could not find or load main class",
            "Error: Could not find or load main class",
            "ClassNotFoundException: net.minecraft",
        ],
        title: "Не найден главный класс игры",
        detail: "JVM не нашла главный класс Minecraft. Обычно это битый classpath, повреждённый клиентский .jar или неверный mainClass у загрузчика. Переустановите сборку и проверьте, что папка libraries не повреждена.",
    },
    Rule {
        keys: &[
            "Unrecognized VM option",
            "Unrecognized option",
            "Error: Could not create the Java Virtual Machine",
            "Invalid maximum heap size",
            "Too small maximum heap",
        ],
        title: "Несовместимые параметры Java",
        detail: "Java не понимает один из JVM-аргументов или размер памяти. Уберите лишние флаги из настроек сборки/лаунчера, уменьшите объём ОЗУ и проверьте, что выбрана подходящая версия Java.",
    },
    Rule {
        keys: &[
            "ModResolutionException",
            "Incompatible mod set",
            "Missing or unsupported mandatory dependencies",
            "DuplicateModsFoundException",
            "Incompatible mods found",
        ],
        title: "Конфликт или несовместимость модов",
        detail: "Набор модов несовместим: не хватает зависимости, дубликат мода или мод не подходит под эту версию/загрузчик. Отключите часть модов и добавляйте по одному, чтобы найти виновника.",
    },
    Rule {
        keys: &[
            "NoClassDefFoundError",
            "ClassNotFoundException",
            "NoSuchMethodError",
            "NoSuchFieldError",
            "LinkageError",
        ],
        title: "Отсутствует библиотека или конфликт версий",
        detail: "Игре не хватает класса/метода — обычно это несовместимая версия мода или повреждённая библиотека. Переустановите мод и проверьте зависимости.",
    },
    Rule {
        keys: &[
            "GLFW error",
            "Failed to create window",
            "Pixel format not accelerated",
            "WGL",
            "OpenGL",
            "Couldn't set pixel format",
        ],
        title: "Проблема с видеодрайвером / OpenGL",
        detail: "Не удалось создать окно игры. Обновите драйверы видеокарты, закройте оверлеи (Discord/GeForce Experience) и проверьте, что запуск идёт не через удалённый рабочий стол.",
    },
    Rule {
        keys: &[
            "AccessDeniedException",
            "Permission denied",
            "The system cannot find the path",
        ],
        title: "Нет доступа к файлам",
        detail: "Лаунчер не может прочитать/записать файл. Запустите лаунчер от имени администратора, проверьте антивирус и путь к папке игры.",
    },
    Rule {
        keys: &[
            "UnknownHostException",
            "ConnectException",
            "SocketException",
            "Failed to login",
            "authentication servers are down",
        ],
        title: "Проблема с сетью или авторизацией",
        detail: "Нет соединения с серверами (или офлайн-режим не подходит для этого сервера). Проверьте интернет и VPN/прокси.",
    },
    Rule {
        keys: &[
            "java.lang.NoSuchMethodError: net.minecraft",
            "Mixin apply failed",
            "MixinTransformerError",
        ],
        title: "Ошибка Mixin (моды несовместимы)",
        detail: "Мод не смог внедриться в игру. Убедитесь, что версии модов совпадают с версией Minecraft и загрузчика, а OptiFine не конфликтует с другими модами.",
    },
    Rule {
        keys: &[
            "java.lang.IllegalStateException: GLFW",
            "Duplicate mods",
            "DuplicateModsFoundException",
        ],
        title: "Дубликаты или сбой запуска",
        detail: "В папке mods лежат две версии одного мода либо повреждён файл. Удалите дубликаты и переустановите подозрительный мод.",
    },
];

fn read_tail(path: &Path, max_lines: usize) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].to_vec()
}

fn newest_crash(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !(name.starts_with("crash-") && name.ends_with(".txt")) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            best = Some((modified, entry.path()));
        }
    }
    best.map(|(_, p)| p)
}

pub fn find_logs(game_dir: &Path) -> (Option<PathBuf>, Option<PathBuf>) {
    let latest = game_dir.join("logs").join("latest.log");
    let latest = if latest.is_file() { Some(latest) } else { None };
    let crash = newest_crash(&game_dir.join("crash-reports"));
    (latest, crash)
}

pub fn analyze(instance_name: &str, exit_code: Option<i32>) -> CrashReport {
    analyze_with_output(instance_name, exit_code, &[], false)
}

/// Анализ с учётом реального stdout/stderr процесса Java.
///
/// `prefer_process` включается для падений в первые секунды: игра могла не
/// успеть создать `latest.log`, а актуальная причина (main class, Java,
/// аргумент) осталась только в выводе процесса.
pub fn analyze_with_output(
    instance_name: &str,
    exit_code: Option<i32>,
    process_output: &[String],
    prefer_process: bool,
) -> CrashReport {
    let game_dir = paths::game_dir(instance_name);
    let (latest, crash) = find_logs(&game_dir);
    let source = crash.clone().or_else(|| latest.clone());
    let lines = source
        .as_deref()
        .map(|p| read_tail(p, 500))
        .unwrap_or_default();

    let process_text = process_output.join("\n");
    let log_text = lines.join("\n");
    let text = if prefer_process && !process_text.trim().is_empty() {
        process_text.clone()
    } else if log_text.trim().is_empty() {
        process_text.clone()
    } else {
        format!("{log_text}\n{process_text}")
    };
    let low = text.to_lowercase();

    let mut causes: Vec<CrashCause> = Vec::new();
    for rule in RULES {
        if rule.keys.iter().any(|k| low.contains(&k.to_lowercase())) {
            if !causes.iter().any(|c| c.title == rule.title) {
                causes.push(CrashCause {
                    title: rule.title.into(),
                    detail: rule.detail.into(),
                });
            }
        }
        if causes.len() >= 4 {
            break;
        }
    }

    if causes.is_empty() {
        match exit_code {
            Some(code) if code != 0 => causes.push(CrashCause {
                title: format!("Игра завершилась с ошибкой (код {code})"),
                detail: "Точная причина в логе не распознана. Откройте лог и найдите строки с «ERROR» или «Exception» — они обычно указывают на виновника.".into(),
            }),
            _ => causes.push(CrashCause {
                title: "Игра закрылась".into(),
                detail: "Код выхода не указывает на ошибку. Если игра вылетела, проверьте папку crash-reports и лог latest.log.".into(),
            }),
        }
    }

    let intro = match exit_code {
        Some(code) if code != 0 && prefer_process && !process_text.trim().is_empty() => format!(
            "Сборка «{instance_name}» завершилась с ошибкой (код {code}) в первые секунды запуска.\nИгра не успела создать свой лог, поэтому ниже — вывод процесса Java:"
        ),
        Some(code) if code != 0 => format!(
            "Сборка «{instance_name}» завершилась с ошибкой (код {code}).\nНиже — вероятные причины и что делать:"
        ),
        _ => format!(
            "Сборка «{instance_name}» закрылась.\nНиже — вероятные причины и что делать:"
        ),
    };

    let log_tail = if lines.is_empty() {
        String::new()
    } else {
        lines[lines.len().saturating_sub(25)..].join("\n")
    };
    let process_tail = if process_output.is_empty() {
        String::new()
    } else {
        process_output[process_output.len().saturating_sub(30)..].join("\n")
    };

    let tail = if prefer_process && !process_tail.is_empty() {
        process_tail
    } else if log_tail.is_empty() && process_tail.is_empty() {
        "Лог не найден. Запустите сборку ещё раз, чтобы лаунчер смог собрать диагностику.".to_string()
    } else if log_tail.is_empty() {
        format!("Вывод процесса Java (stderr/stdout):\n{process_tail}")
    } else if process_tail.is_empty() {
        log_tail
    } else {
        format!(
            "{log_tail}\n\n--- Вывод процесса Java (stderr/stdout) ---\n{process_tail}"
        )
    };

    CrashReport {
        title: "Анализ краша".into(),
        intro,
        causes,
        log_path: source.map(|p| p.to_string_lossy().to_string()),
        tail,
        exit_code,
    }
}

/// Текстовая версия отчёта (для копирования в буфер обмена).
pub fn as_text(report: &CrashReport) -> String {
    let mut parts = vec![report.intro.clone(), String::new()];
    for (i, c) in report.causes.iter().enumerate() {
        parts.push(format!("{}) {}", i + 1, c.title));
        parts.push(format!("   {}", c.detail));
        parts.push(String::new());
    }
    if let Some(path) = &report.log_path {
        parts.push(format!("Лог: {path}"));
    }
    parts.join("\n")
}
