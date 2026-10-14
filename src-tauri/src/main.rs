#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod drive;
mod files;
mod fonts;
mod pdf;

use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct PendingPath(Mutex<Option<String>>);

fn document_argument(args: impl IntoIterator<Item = String>) -> Option<String> {
    args.into_iter().find_map(|arg| {
        let path = PathBuf::from(arg);
        (path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("libria"))
            && path.is_file())
        .then(|| {
            path.canonicalize()
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
        })
        .flatten()
    })
}

#[tauri::command]
fn pending_path(state: tauri::State<PendingPath>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[tauri::command]
async fn open_dialog(app: tauri::AppHandle, kind: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (label, extensions) = if kind == "theme" {
            ("Tema Libria", vec!["libria-theme", "json"])
        } else {
            ("Documento Libria", vec!["libria", "json"])
        };
        app.dialog()
            .file()
            .add_filter(label, &extensions)
            .blocking_pick_file()
            .map(|p| {
                p.into_path()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_dialog(
    app: tauri::AppHandle,
    default_name: String,
    kind: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (label, extension) = if kind == "theme" {
            ("Tema Libria", "libria-theme")
        } else {
            ("Documento Libria", "libria")
        };
        app.dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter(label, &[extension])
            .blocking_save_file()
            .map(|p| {
                p.into_path()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_file(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = files::document_path(&file_path)?;
        files::read_text(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_file(file_path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = files::document_path(&file_path)?;
        files::atomic_write(&path, content.as_bytes())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = PathBuf::from(&filename)
            .file_name()
            .ok_or("Nombre inválido")?
            .to_string_lossy()
            .into_owned();
        let extension = PathBuf::from(&name)
            .extension()
            .ok_or("Extensión inválida")?
            .to_string_lossy()
            .into_owned();
        if !["pdf", "epub", "docx", "odt"].contains(&extension.as_str()) {
            return Err("Formato de exportación inválido".into());
        }
        let Some(file) = app
            .dialog()
            .file()
            .set_file_name(&name)
            .add_filter(&extension.to_uppercase(), &[&extension])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        files::atomic_write(&file.into_path().map_err(|e| e.to_string())?, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn dictionary(
    app: tauri::AppHandle,
    action: String,
    word: Option<String>,
) -> Result<Value, String> {
    // Serialize read-modify-write operations to avoid dropping simultaneous additions.
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap();
    let path = data_dir(&app)?.join("custom-dictionary.json");
    let mut words: Vec<String> = if path.exists() {
        serde_json::from_str(&files::read_text(&path)?).map_err(|e| e.to_string())?
    } else {
        vec![]
    };
    if action == "list" {
        return Ok(json!(words));
    }
    let word = word
        .filter(|w| !w.trim().is_empty() && w.len() <= 256)
        .ok_or("Palabra inválida")?;
    let exists = words.contains(&word);
    match action.as_str() {
        "add" if !exists => words.push(word),
        "remove" => words.retain(|w| w != &word),
        "add" => {}
        _ => return Err("Acción inválida".into()),
    }
    files::atomic_write(
        &path,
        &serde_json::to_vec(&words).map_err(|e| e.to_string())?,
    )?;
    Ok(json!(if action == "add" { !exists } else { exists }))
}

#[tauri::command]
async fn check_updates(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Libria")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get("https://api.github.com/repos/Gargadon/libria/releases/latest")
        .send()
        .await
        .map_err(|_| "No se pudo consultar GitHub")?;
    let release: Value = response
        .error_for_status()
        .map_err(|_| "No se pudo consultar GitHub")?
        .json()
        .await
        .map_err(|_| "Respuesta de GitHub inválida")?;
    let tag = release["tag_name"]
        .as_str()
        .ok_or("Versión inválida")?
        .trim_start_matches('v');
    let latest = semver::Version::parse(tag).map_err(|_| "Versión inválida")?;
    let current = &app.package_info().version;
    Ok((latest > *current).then(
        || json!({ "version": tag, "url": "https://github.com/Gargadon/libria/releases/latest" }),
    ))
}

fn main() {
    tauri::Builder::default()
        .manage(PendingPath(Mutex::new(document_argument(
            std::env::args().skip(1),
        ))))
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(path) = document_argument(args.into_iter().skip(1)) {
                let _ = app.emit("file:open", path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            app.manage(drive::Drive::new(app.handle())?);
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_web_resource_request(|request, response| {
                    // Vivliostyle's bundled Knockout UI compiles data-bind expressions.
                    // Enable this only in the viewer document, not in Angular or book HTML.
                    if request.uri().path() == "/vivliostyle/index.html" {
                        if let Some(policy) = response
                            .headers()
                            .get("Content-Security-Policy")
                            .and_then(|v| v.to_str().ok())
                        {
                            let policy = policy.replace("script-src ", "script-src 'unsafe-eval' ");
                            if let Ok(value) = policy.parse() {
                                response
                                    .headers_mut()
                                    .insert("Content-Security-Policy", value);
                            }
                        }
                    }
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pending_path,
            open_dialog,
            save_dialog,
            read_file,
            write_file,
            save_export,
            dictionary,
            check_updates,
            pdf::fonts_css,
            fonts::system_fonts,
            fonts::font_variants,
            pdf::print_html,
            drive::drive
        ])
        .build(tauri::generate_context!())
        .expect("No se pudo iniciar Libria")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(path) = document_argument([path.to_string_lossy().into_owned()])
                        {
                            *app.state::<PendingPath>().0.lock().unwrap() = Some(path.clone());
                            let _ = app.emit("file:open", path);
                        }
                    }
                }
            }
            let _ = (app, event);
        });
}
