//! Runtime resource lookup is strictly local. Downloads and extraction belong to packaging.
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct Model {
    pub name: String,
}
pub struct Assets {
    pub library: PathBuf,
    pub model: PathBuf,
    pub host: Option<PathBuf>,
}

pub fn model_for_language(lang: &str) -> Result<Model, String> {
    let key = lang
        .split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut models: std::collections::HashMap<String, Model> =
        serde_json::from_str(include_str!("models.json")).map_err(|_| "model")?;
    models.remove(&key).ok_or_else(|| "language".into())
}
fn system_library() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let triplet = match std::env::consts::ARCH {
            "x86_64" => "x86_64-linux-gnu",
            "aarch64" => "aarch64-linux-gnu",
            "arm" => "arm-linux-gnueabihf",
            _ => "unknown",
        };
        for directory in [
            "/usr/lib".into(),
            "/usr/lib64".into(),
            format!("/usr/lib/{triplet}"),
            "/usr/local/lib".into(),
        ] {
            for filename in ["libvosk.so", "libvosk.so.0"] {
                let path = PathBuf::from(&directory).join(filename);
                if path.is_file() && super::engine::compatible_library(&path) {
                    return Some(path);
                }
            }
        }
    }
    None
}
pub fn resolve(root: &Path, lang: &str) -> Result<Assets, String> {
    resolve_with_system(root, lang, system_library())
}
fn resolve_with_system(root: &Path, lang: &str, system: Option<PathBuf>) -> Result<Assets, String> {
    let model = root.join("models").join(model_for_language(lang)?.name);
    if !(model.join("am/final.mdl").is_file() || model.join("final.mdl").is_file())
        || !(model.join("conf/mfcc.conf").is_file() || model.join("mfcc.conf").is_file())
    {
        return Err("resources".into());
    }
    // Native distribution packages (Arch, Fedora/Red Hat) take precedence over a bundled fallback.
    if let Some(library) = system {
        return Ok(Assets {
            library,
            model,
            host: None,
        });
    }
    let filename = if cfg!(windows) {
        "libvosk.dll"
    } else if cfg!(target_os = "macos") {
        "libvosk.dyld"
    } else {
        "libvosk.so"
    };
    let library = root.join("engine/vosk").join(filename);
    if !library.is_file() {
        return Err("resources".into());
    }
    let host = if cfg!(all(windows, target_arch = "aarch64")) {
        let host = root.join("host/libria-vosk-host.exe");
        if !host.is_file() {
            return Err("resources".into());
        }
        Some(host)
    } else {
        None
    };
    Ok(Assets {
        library,
        model,
        host,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn model_fixture(root: &Path, lang: &str, legacy: bool) -> PathBuf {
        let model = root
            .join("models")
            .join(model_for_language(lang).unwrap().name);
        let acoustic = model.join(if legacy { "final.mdl" } else { "am/final.mdl" });
        let config = model.join(if legacy {
            "mfcc.conf"
        } else {
            "conf/mfcc.conf"
        });
        std::fs::create_dir_all(acoustic.parent().unwrap()).unwrap();
        std::fs::create_dir_all(config.parent().unwrap()).unwrap();
        std::fs::write(acoustic, b"fixture").unwrap();
        std::fs::write(config, b"fixture").unwrap();
        model
    }
    #[test]
    fn six_languages_resolve_to_their_small_models() {
        for (locale, name) in [
            ("en-GB", "vosk-model-small-en-us-0.15"),
            ("fr-FR", "vosk-model-small-fr-0.22"),
            ("it-IT", "vosk-model-small-it-0.22"),
            ("de-DE", "vosk-model-small-de-0.15"),
            ("pt-BR", "vosk-model-small-pt-0.3"),
            ("es-MX", "vosk-model-small-es-0.42"),
        ] {
            assert_eq!(model_for_language(locale).unwrap().name, name);
        }
        assert!(model_for_language("ja-JP").is_err());
    }
    #[test]
    fn distribution_engine_wins_even_when_a_bundled_library_exists() {
        let root = tempfile::tempdir().unwrap();
        let model = model_fixture(root.path(), "es-MX", false);
        std::fs::create_dir_all(root.path().join("engine/vosk")).unwrap();
        std::fs::write(root.path().join("engine/vosk/libvosk.so"), b"bundled").unwrap();
        let system = PathBuf::from("/usr/lib64/libvosk.so");
        let assets = resolve_with_system(root.path(), "es-MX", Some(system.clone())).unwrap();
        assert_eq!(assets.library, system);
        assert_eq!(assets.model, model);
        assert!(assets.host.is_none());
    }
    #[test]
    fn system_engine_works_with_legacy_portuguese_resources() {
        let root = tempfile::tempdir().unwrap();
        let model = model_fixture(root.path(), "pt-PT", true);
        let assets =
            resolve_with_system(root.path(), "pt-PT", Some("/usr/lib/libvosk.so".into())).unwrap();
        assert_eq!(assets.model, model);
    }
    #[test]
    fn missing_resources_return_an_error_instead_of_downloading() {
        let root = tempfile::tempdir().unwrap();
        assert!(
            matches!(resolve_with_system(root.path(), "es", None), Err(code) if code == "resources")
        );
        model_fixture(root.path(), "es", false);
        assert!(
            matches!(resolve_with_system(root.path(), "es", None), Err(code) if code == "resources")
        );
        assert!(std::fs::read_dir(root.path())
            .unwrap()
            .all(|p| p.unwrap().file_name() == "models"));
    }
}
