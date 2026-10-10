use crate::files::{self, MAX_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

fn assets(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public"));
    }
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("runtime/assets"))
}

fn inline_fonts(base: &Path) -> Result<String, String> {
    let css = files::read_text(&base.join("fonts.css"))?;
    let pattern = regex::Regex::new(r#"url\(['"]?fonts/([A-Za-z0-9_.-]+)['"]?\)"#).unwrap();
    let mut failure = None;
    let result = pattern.replace_all(&css, |captures: &regex::Captures<'_>| {
        let filename = &captures[1];
        match std::fs::read(base.join("fonts").join(filename)) {
            Ok(bytes) => format!(
                "url(data:font/{};base64,{})",
                if filename.ends_with(".woff") {
                    "woff"
                } else {
                    "woff2"
                },
                STANDARD.encode(bytes)
            ),
            Err(_) => {
                failure = Some(format!("No se encontró la fuente {filename}"));
                captures[0].into()
            }
        }
    });
    if let Some(error) = failure {
        return Err(error);
    }
    Ok(result.into_owned())
}

#[tauri::command]
pub async fn fonts_css(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || inline_fonts(&assets(&app)?))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn print_html(
    app: tauri::AppHandle,
    html: String,
    options: Value,
) -> Result<Vec<u8>, String> {
    if html.len() > MAX_BYTES {
        return Err("El documento supera 100 MB".into());
    }
    let width = options["pageSize"]["width"]
        .as_f64()
        .ok_or("Ancho de página inválido")?;
    let height = options["pageSize"]["height"]
        .as_f64()
        .ok_or("Alto de página inválido")?;
    if !width.is_finite()
        || !height.is_finite()
        || !(0.0..=100.0).contains(&width)
        || !(0.0..=100.0).contains(&height)
        || width == 0.0
        || height == 0.0
    {
        return Err("Tamaño de página PDF inválido".into());
    }
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let input = dir.path().join("book.html");
    let output = dir.path().join("book.pdf");
    let config = dir.path().join("options.json");
    let fonts = fonts_css(app.clone()).await?;
    let html = html.replacen("</head>", &format!("<style>{fonts}</style></head>"), 1);
    files::atomic_write(&input, html.as_bytes())?;
    files::atomic_write(
        &config,
        &serde_json::to_vec(&options).map_err(|e| e.to_string())?,
    )?;
    let runtime = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("runtime");
    let (node, helper, runtime) = if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        (
            PathBuf::from("node"),
            root.join("scripts/pdf-export.mjs"),
            root.join("build/tauri-resources"),
        )
    } else {
        (
            runtime.join(if cfg!(windows) { "node.exe" } else { "node" }),
            runtime.join("pdf/pdf-export.mjs"),
            runtime,
        )
    };
    let mut command = tokio::process::Command::new(node);
    command
        .arg(helper)
        .arg(&input)
        .arg(&output)
        .arg(config)
        .arg(runtime)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let result = tokio::time::timeout(Duration::from_secs(180), command.output())
        .await
        .map_err(|_| "La exportación PDF tardó demasiado")?
        .map_err(|_| "No se pudo iniciar el motor PDF. Ejecuta bun run tauri:prepare")?;
    if !result.status.success() {
        // The helper writes only a controlled error message; never relay document or arbitrary process output.
        return Err(if options["pdfx"] == true {
            "No se pudo exportar PDF/X. Comprueba el motor PDF y Ghostscript"
        } else {
            "No se pudo componer el PDF con Vivliostyle. Comprueba el motor PDF"
        }
        .into());
    }
    let metadata = std::fs::metadata(&output).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_BYTES as u64 {
        return Err("El PDF supera 100 MB".into());
    }
    let bytes = std::fs::read(output).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("El motor no devolvió un PDF válido".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embeds_local_fonts_for_blob_preview_and_export() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("fonts")).unwrap();
        std::fs::write(dir.path().join("fonts/test.woff2"), b"font bytes").unwrap();
        std::fs::write(
            dir.path().join("fonts.css"),
            "@font-face{src:url('fonts/test.woff2')}",
        )
        .unwrap();
        let css = inline_fonts(dir.path()).unwrap();
        assert!(css.contains("data:font/woff2;base64,"));
        assert!(!css.contains("fonts/test.woff2"));
        std::fs::remove_file(dir.path().join("fonts/test.woff2")).unwrap();
        assert!(inline_fonts(dir.path()).is_err());
    }
}
