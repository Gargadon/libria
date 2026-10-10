fn main() {
    // Development and unit tests do not need the packaged PDF runtime.
    // Keep the resource directory valid on a fresh checkout before preparation.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        let root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../build/tauri-resources");
        std::fs::create_dir_all(root).expect("No se pudo crear el directorio de recursos");
    }
    tauri_build::build();
}
