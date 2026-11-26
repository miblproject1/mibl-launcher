//! Mibl Launcher 2.6 — локальный лаунчер Minecraft (Tauri v2).

mod accounts;
mod archive;
mod auth;
mod backups;
mod commands;
mod crash;
mod curse;
mod ely;
mod http;
mod install;
mod instances;
mod java;
mod launch;
mod launcher_import;
mod loaders;
mod models;
mod modrinth;
mod paths;
mod proc;
mod store;
mod tasks;
mod version;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::tasks_snapshot,
            commands::tasks_clear,
            commands::save_config,
            commands::save_theme,
            commands::apply_theme_preset,
            commands::reset_theme,
            commands::system_info_cmd,
            commands::open_path,
            commands::open_instance_folder,
            commands::pick_file,
            commands::pick_save_path,
            commands::list_instances,
            commands::create_instance,
            commands::install_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::loader_versions,
            commands::launch_instance,
            commands::default_jvm,
            commands::list_content,
            commands::toggle_content,
            commands::delete_content,
            commands::modrinth_search,
            commands::modrinth_install,
            commands::content_search,
            commands::content_install,
            commands::minecraft_versions,
            commands::ultra_fps,
            commands::accounts_snapshot_cmd,
            commands::account_select,
            commands::account_remove,
            commands::account_add_offline,
            commands::account_rename,
            commands::account_set_skin_path,
            commands::account_pick_skin,
            commands::account_skin_data,
            commands::ely_login,
            commands::ely_add_nick,
            commands::account_refresh_skin,
            commands::ely_textures,
            commands::microsoft_login_start,
            commands::microsoft_login_poll,
            commands::microsoft_refresh_account,
            commands::list_world_backups,
            commands::backup_worlds_now,
            commands::restore_world_backup,
            commands::delete_world_backup,
            commands::open_backups_folder,
            commands::scan_other_launchers,
            commands::inspect_launcher_folder,
            commands::import_other_instances,
            commands::pick_folder,
            commands::analyze_crash,
            commands::crash_report_text,
            commands::import_modpack,
            commands::export_instance,
            commands::modpack_search,
            commands::modpack_install,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Mibl Launcher");
}
