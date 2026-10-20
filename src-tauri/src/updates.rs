use serde_json::{json, Value};

const RELEASES_URL: &str = "https://github.com/Gargadon/libria/releases/latest";

/// Use the published installer names shared with scripts/stage-installers.mjs.
fn installer_suffix(os: &str, arch: &str) -> Option<String> {
    let arch = match arch {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => return None,
    };
    match os {
        "windows" => Some(format!("win-{arch}.exe")),
        "macos" => Some(format!("mac-{arch}.dmg")),
        "linux" => Some(format!(
            "linux-{}.AppImage",
            if arch == "x64" { "x86_64" } else { arch }
        )),
        _ => None,
    }
}

fn update_from_release(
    release: &Value,
    current: &semver::Version,
    os: &str,
    arch: &str,
) -> Result<Option<Value>, String> {
    let tag = release["tag_name"]
        .as_str()
        .ok_or("Versión inválida")?
        .trim_start_matches('v');
    let latest = semver::Version::parse(tag).map_err(|_| "Versión inválida")?;
    if latest <= *current || release["draft"] == true || release["prerelease"] == true {
        return Ok(None);
    }
    let suffix = installer_suffix(os, arch);
    let expected_name = suffix.map(|suffix| format!("libria-{tag}-{suffix}"));
    let download = release["assets"].as_array().and_then(|assets| {
        assets.iter().find_map(|asset| {
            if asset["name"].as_str() != Some(expected_name.as_deref()?) {
                return None;
            }
            asset["browser_download_url"].as_str().filter(|url| {
                url.starts_with("https://github.com/Gargadon/libria/releases/download/")
            })
        })
    });
    Ok(Some(
        json!({ "version": tag, "url": download.unwrap_or(RELEASES_URL) }),
    ))
}

#[tauri::command]
pub async fn check_updates(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Libria")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let release: Value = client
        .get("https://api.github.com/repos/Gargadon/libria/releases/latest")
        .send()
        .await
        .map_err(|_| "No se pudo consultar GitHub")?
        .error_for_status()
        .map_err(|_| "No se pudo consultar GitHub")?
        .json()
        .await
        .map_err(|_| "Respuesta de GitHub inválida")?;
    update_from_release(
        &release,
        &app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release() -> Value {
        let names = [
            "win-x64.exe",
            "win-arm64.exe",
            "mac-x64.dmg",
            "mac-arm64.dmg",
            "linux-x86_64.AppImage",
            "linux-arm64.AppImage",
            "linux-amd64.deb",
        ];
        json!({
            "tag_name": "v2.1.2",
            "assets": names.iter().map(|suffix| {
                let name = format!("libria-2.1.2-{suffix}");
                json!({"name": name, "browser_download_url": format!("https://github.com/Gargadon/libria/releases/download/v2.1.2/{name}")})
            }).collect::<Vec<_>>()
        })
    }

    #[test]
    fn selects_the_installer_for_each_platform_and_architecture() {
        for (os, arch, suffix) in [
            ("windows", "x86_64", "win-x64.exe"),
            ("windows", "aarch64", "win-arm64.exe"),
            ("macos", "x86_64", "mac-x64.dmg"),
            ("macos", "aarch64", "mac-arm64.dmg"),
            ("linux", "x86_64", "linux-x86_64.AppImage"),
            ("linux", "aarch64", "linux-arm64.AppImage"),
        ] {
            let update = update_from_release(&release(), &semver::Version::new(2, 1, 1), os, arch)
                .unwrap()
                .unwrap();
            assert_eq!(update["version"], "2.1.2");
            assert!(update["url"].as_str().unwrap().ends_with(suffix));
        }
    }

    #[test]
    fn falls_back_to_releases_when_no_compatible_installer_is_available() {
        for value in [
            json!({"tag_name": "v2.1.2"}),
            json!({"tag_name": "v2.1.2", "assets": [{"name": "libria-2.1.2-win-x64.exe", "browser_download_url": "https://example.com/untrusted.exe"}]}),
        ] {
            let update =
                update_from_release(&value, &semver::Version::new(2, 1, 1), "windows", "x86_64")
                    .unwrap()
                    .unwrap();
            assert_eq!(update["url"], RELEASES_URL);
        }
        let update = update_from_release(
            &release(),
            &semver::Version::new(2, 1, 1),
            "linux",
            "riscv64",
        )
        .unwrap()
        .unwrap();
        assert_eq!(update["url"], RELEASES_URL);
    }

    #[test]
    fn ignores_older_equal_and_unstable_releases_and_rejects_invalid_versions() {
        for current in [semver::Version::new(2, 1, 2), semver::Version::new(2, 2, 0)] {
            assert!(update_from_release(&release(), &current, "linux", "x86_64")
                .unwrap()
                .is_none());
        }
        for flag in ["draft", "prerelease"] {
            let mut value = release();
            value[flag] = json!(true);
            assert!(
                update_from_release(&value, &semver::Version::new(2, 1, 1), "linux", "x86_64")
                    .unwrap()
                    .is_none()
            );
        }
        assert!(update_from_release(
            &json!({"tag_name": "invalid"}),
            &semver::Version::new(2, 1, 1),
            "linux",
            "x86_64"
        )
        .is_err());
    }
}
