//! Запуск дочерних процессов без появления окна консоли.
//!
//! На Windows лаунчер — GUI-приложение, поэтому java.exe/java-инсталляторы
//! не должны открывать чёрное окно командной строки. Для этого всем дочерним
//! процессам выставляется флаг `CREATE_NO_WINDOW`.

/// Процесс запускается без консольного окна (Windows).
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Процесс запускается в отдельной группе (используется для самой игры).
#[cfg(windows)]
pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// Скрывает консольное окно дочернего процесса.
#[cfg(windows)]
pub fn hide_console(cmd: &mut tokio::process::Command) {
    apply_flags(cmd, CREATE_NO_WINDOW);
}

/// Скрывает консольное окно и запускает процесс в отдельной группе.
#[cfg(windows)]
pub fn hide_console_new_group(cmd: &mut tokio::process::Command) {
    apply_flags(cmd, CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(windows)]
fn apply_flags(cmd: &mut tokio::process::Command, flags: u32) {
    // CommandExt нужен для std::process::Command; у tokio::process::Command
    // есть одноимённый встроенный метод, поэтому импорт оставлен намеренно.
    #[allow(unused_imports)]
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(flags);
}

/// На других платформах консольное окно не появляется — ничего не делаем.
#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut tokio::process::Command) {}

#[cfg(not(windows))]
pub fn hide_console_new_group(_cmd: &mut tokio::process::Command) {}
