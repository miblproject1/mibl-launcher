//! Манифесты версий, правила и разворачивание `inheritsFrom`.

use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::Value;

use crate::http;
use crate::models::{MojangManifest, VersionEntry};
use crate::paths;

pub const MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const RESOURCES_URL: &str = "https://resources.download.minecraft.net";
pub const JAVA_ALL_URL: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/\
2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

pub async fn fetch_manifest() -> Result<Vec<VersionEntry>, String> {
    let raw = http::get_json(MANIFEST_URL).await?;
    let manifest: MojangManifest =
        serde_json::from_value(raw).map_err(|e| format!("Манифест: {e}"))?;
    Ok(manifest.versions)
}

pub fn version_json_path(vid: &str) -> PathBuf {
    paths::versions_dir().join(vid).join(format!("{vid}.json"))
}

pub fn load_version_json(vid: &str) -> Result<Value, String> {
    let path = version_json_path(vid);
    let text = std::fs::read_to_string(&path)
        .map_err(|_| format!("Версия {vid} не установлена"))?;
    serde_json::from_str(&text).map_err(|e| format!("JSON версии {vid}: {e}"))
}

fn rule_matches(rule: &Value) -> bool {
    if let Some(os) = rule.get("os") {
        if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
            if name != "windows" {
                return false;
            }
        }
        if let Some(arch) = os.get("arch").and_then(|v| v.as_str()) {
            if arch != "x86_64" {
                return false;
            }
        }
    }
    if rule.get("features").is_some() {
        return false;
    }
    true
}

pub fn rules_allow(rules: Option<&Vec<Value>>) -> bool {
    let Some(rules) = rules else { return true };
    if rules.is_empty() {
        return true;
    }
    let mut result = false;
    for rule in rules {
        if rule_matches(rule) {
            result = rule.get("action").and_then(|a| a.as_str()) == Some("allow");
        }
    }
    result
}

pub fn lib_allowed(lib: &Value) -> bool {
    let rules = lib.get("rules").and_then(|r| r.as_array());
    rules_allow(rules)
}

/// Загрузить всю цепочку `inheritsFrom`: [сама версия, её родитель, ... корень].
///
/// Для Forge/NeoForge/Fabric это критично: нативные библиотеки (например,
/// `lwjgl64.dll` для 1.12.2) описаны только в JSON родительской ванильной
/// версии, а JSON лоадера содержит лишь `inheritsFrom` и свои библиотеки.
pub fn load_chain(version_id: &str) -> Result<Vec<(String, Value)>, String> {
    let mut chain: Vec<(String, Value)> = Vec::new();
    let mut cur = Some(version_id.to_string());
    let mut seen = std::collections::HashSet::new();

    while let Some(id) = cur {
        if !seen.insert(id.clone()) {
            break;
        }
        let data = load_version_json(&id)?;
        cur = data
            .get("inheritsFrom")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        chain.push((id, data));
    }
    if chain.is_empty() {
        return Err(format!("Версия {version_id} не найдена"));
    }
    Ok(chain)
}

/// Библиотеки из всей цепочки наследования (родитель → дочерняя версия).
pub fn chain_libraries(version_id: &str) -> Result<Vec<Value>, String> {
    let chain = load_chain(version_id)?;
    let mut libraries: Vec<Value> = Vec::new();
    for (_id, data) in chain.iter().rev() {
        if let Some(libs) = data.get("libraries").and_then(|v| v.as_array()) {
            libraries.extend(libs.iter().cloned());
        }
    }
    Ok(libraries)
}

/// Развернуть цепочку `inheritsFrom` в один JSON. Возвращает (json, root_id).
pub fn resolve_version(version_id: &str) -> Result<(Value, String), String> {
    let chain = load_chain(version_id)?;
    let root_id = chain.last().map(|(id, _)| id.clone()).unwrap_or_default();
    let mut libraries: Vec<Value> = Vec::new();
    let mut jvm: Vec<Value> = Vec::new();
    let mut game: Vec<Value> = Vec::new();
    let mut asset_index = Value::Null;
    let mut java_version = Value::Null;
    let mut minecraft_arguments: Option<String> = None;

    for (_id, data) in chain.iter().rev() {
        if let Some(libs) = data.get("libraries").and_then(|v| v.as_array()) {
            libraries.extend(libs.iter().cloned());
        }
        if let Some(ai) = data.get("assetIndex") {
            if !ai.is_null() {
                asset_index = ai.clone();
            }
        }
        if let Some(jv) = data.get("javaVersion") {
            if !jv.is_null() {
                java_version = jv.clone();
            }
        }
        if let Some(args) = data.get("arguments") {
            if let Some(list) = args.get("jvm").and_then(|v| v.as_array()) {
                jvm.extend(list.iter().cloned());
            }
            if let Some(list) = args.get("game").and_then(|v| v.as_array()) {
                game.extend(list.iter().cloned());
            }
        }
        if let Some(ma) = data.get("minecraftArguments").and_then(|v| v.as_str()) {
            minecraft_arguments = Some(ma.to_string());
        }
    }

    let main_class = chain
        .first()
        .and_then(|(_, data)| data.get("mainClass"))
        .cloned()
        .unwrap_or(Value::Null);
    let kind = chain
        .last()
        .and_then(|(_, data)| data.get("type"))
        .cloned()
        .unwrap_or_else(|| Value::String("release".into()));

    let merged = serde_json::json!({
        "libraries": libraries,
        "arguments": { "jvm": jvm, "game": game },
        "mainClass": main_class,
        "assetIndex": asset_index,
        "javaVersion": java_version,
        "minecraftArguments": minecraft_arguments,
        "type": kind,
    });
    Ok((merged, root_id))
}

pub fn expand(text: &str, vars: &HashMap<String, String>) -> String {
    let mut out = text.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("${{{key}}}"), value);
    }
    out
}

pub fn expand_args(args: &[Value], vars: &HashMap<String, String>) -> Vec<String> {
    let mut out = Vec::new();
    for item in args {
        if let Some(s) = item.as_str() {
            out.push(expand(s, vars));
        } else if item.is_object() {
            let rules = item.get("rules").and_then(|r| r.as_array());
            if rules_allow(rules) {
                match item.get("value") {
                    Some(Value::Array(list)) => {
                        for v in list {
                            if let Some(s) = v.as_str() {
                                out.push(expand(s, vars));
                            }
                        }
                    }
                    Some(Value::String(s)) => out.push(expand(s, vars)),
                    _ => {}
                }
            }
        }
    }
    out
}

pub fn version_ready(vid: &str) -> bool {
    let dir = paths::versions_dir().join(vid);
    // Check that version JSON exists
    if !dir.join(format!("{vid}.json")).is_file() {
        return false;
    }
    
    // For loader versions (Fabric, Forge, etc.), we need to check if the base Minecraft version jar exists
    // This handles cases where the loading version depends on an inherited vanilla version
    match resolve_version(vid) {
        Ok((_merged, root)) => {
            // If it's a loader version that inherits from a vanilla version, 
            // make sure the inherited vanilla jar exists
            paths::versions_dir()
                .join(&root)
                .join(format!("{root}.jar"))
                .is_file()
        }
        Err(_) => false,
    }
}
