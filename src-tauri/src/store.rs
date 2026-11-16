//! Чтение/запись config.json и theme.json (совместимо с Python-версией).

use crate::models::{Config, Theme, ThemePreset};
use crate::paths;

pub fn load_config() -> Config {
    std::fs::read_to_string(paths::config_path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(paths::config_path(), text).map_err(|e| e.to_string())
}

pub fn load_theme() -> Theme {
    let mut theme = std::fs::read_to_string(paths::theme_path())
        .ok()
        .and_then(|t| serde_json::from_str::<Theme>(&t).ok())
        .unwrap_or_default();
    // Миграция 2.4: старая кислотно-фиолетовая палитра заменяется графитовой.
    if theme.preset == "dark"
        && (theme.accent.eq_ignore_ascii_case("#8000ff")
            || theme.accent.eq_ignore_ascii_case("#4ecca3"))
    {
        theme.accent = "#5E6AD2".into();
        theme.bg = "#0C0D10".into();
        theme.panel = "#13151B".into();
        theme.panel2 = "#1A1D24".into();
        theme.fg = "#EDEEF2".into();
        theme.muted = "#8B90A0".into();
        if theme.radius == 10 {
            theme.radius = 12;
        }
        if (theme.glass - 0.66).abs() < f32::EPSILON {
            theme.glass = 0.72;
        }
        let _ = save_theme(&theme);
    }
    theme
}

pub fn save_theme(theme: &Theme) -> Result<(), String> {
    let text = serde_json::to_string_pretty(theme).map_err(|e| e.to_string())?;
    std::fs::write(paths::theme_path(), text).map_err(|e| e.to_string())
}

pub fn apply_preset(theme: &mut Theme, preset: &ThemePreset) {
    theme.preset = preset.key.clone();
    theme.accent = preset.accent.clone();
    theme.bg = preset.bg.clone();
    theme.panel = preset.panel.clone();
    theme.panel2 = preset.panel2.clone();
    theme.fg = preset.fg.clone();
    theme.muted = preset.muted.clone();
}
