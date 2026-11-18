use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

const RELEASES_URL: &str = "https://github.com/Gargadon/libria/releases/latest";
const DOWNLOAD_PREFIX: &str = "https://github.com/Gargadon/libria/releases/download/";
const MAX_INSTALLER_BYTES: u64 = 2 * 1024 * 1024 * 1024;

struct PreparedUpdate {
    _directory: tempfile::TempDir,
    installer: PathBuf,
    sha256: String,
    version: String,
}

#[derive(Default)]
pub struct Updates(tokio::sync::Mutex<Option<PreparedUpdate>>);

pub fn cleanup_downloads(app: &tauri::AppHandle) {
    let Ok(cache) = app.path().app_cache_dir() else {
        return;
    };
    // Successful installs retain their EXE until NSIS has finished. Remove only
    // our old temporary directories on later starts, never a recent installer.
    std::thread::spawn(move || {
        let Ok(entries) = std::fs::read_dir(cache.join("updates")) else {
            return;
        };
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with("libria-update-")
                && entry
                    .file_type()
                    .is_ok_and(|kind| kind.is_dir() && !kind.is_symlink())
                && entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|time| time.elapsed().ok())
                    .is_some_and(|age| age > Duration::from_secs(24 * 60 * 60))
            {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    });
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

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
    if latest <= *current
        || !latest.pre.is_empty()
        || release["draft"] == true
        || release["prerelease"] == true
    {
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
                let release_tag = release["tag_name"].as_str().unwrap_or("");
                *url == format!(
                    "{DOWNLOAD_PREFIX}{release_tag}/{}",
                    expected_name.as_deref().unwrap()
                )
            })
        })
    });
    Ok(Some(
        json!({ "version": tag, "url": download.unwrap_or(RELEASES_URL), "canInstall": os == "windows" && download.is_some() }),
    ))
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Libria")
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(60))
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())
}

async fn latest_release(client: &reqwest::Client) -> Result<Value, String> {
    client
        .get("https://api.github.com/repos/Gargadon/libria/releases/latest")
        .send()
        .await
        .map_err(|_| "No se pudo consultar GitHub")?
        .error_for_status()
        .map_err(|_| "No se pudo consultar GitHub")?
        .json()
        .await
        .map_err(|_| "Respuesta de GitHub inválida".into())
}

#[tauri::command]
pub async fn check_updates(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let release = latest_release(&client(Duration::from_secs(15))?).await?;
    update_from_release(
        &release,
        &app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}

fn checksum_from_list(list: &str, filename: &str) -> Result<String, String> {
    let matches: Vec<_> = list
        .lines()
        .filter_map(|line| {
            let (hash, name) = line.split_once(char::is_whitespace)?;
            (name.trim_start().trim_start_matches('*') == filename && valid_sha256(hash))
                .then(|| hash.to_ascii_lowercase())
        })
        .collect();
    if matches.len() != 1 {
        return Err("No se encontró un SHA-256 único para el instalador.".into());
    }
    Ok(matches[0].clone())
}

fn verify_file(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if !valid_sha256(expected) || hex::encode(hash.finalize()) != expected.to_ascii_lowercase() {
        return Err(
            "El instalador no coincide con el SHA-256 publicado. Vuelve a descargarlo.".into(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Updates>,
    version: String,
    progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("La instalación integrada está disponible en Windows.".into());
    }
    let mut prepared = state
        .0
        .try_lock()
        .map_err(|_| "Ya hay una actualización en curso.")?;
    if prepared
        .as_ref()
        .is_some_and(|update| update.version == version)
    {
        return Ok(());
    }
    // Resolve again in Rust: the webview never supplies a download URL or executable path.
    let metadata_client = client(Duration::from_secs(20))?;
    let release = latest_release(&metadata_client).await?;
    let update = update_from_release(
        &release,
        &app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )?
    .ok_or("La actualización ya no está disponible.")?;
    if update["version"] != version || update["canInstall"] != true {
        return Err("La versión disponible cambió. Vuelve a buscar actualizaciones.".into());
    }
    let url = update["url"].as_str().ok_or("Instalador inválido")?;
    let filename = url.rsplit('/').next().ok_or("Instalador inválido")?;
    let assets = release["assets"].as_array().ok_or("Instalador inválido")?;
    let asset = assets
        .iter()
        .find(|a| a["name"] == filename)
        .ok_or("Instalador inválido")?;
    let total = asset["size"]
        .as_u64()
        .filter(|size| *size > 0 && *size <= MAX_INSTALLER_BYTES)
        .ok_or("Tamaño del instalador inválido")?;
    let sha256 = if let Some(digest) = asset["digest"]
        .as_str()
        .and_then(|s| s.strip_prefix("sha256:"))
        .filter(|s| valid_sha256(s))
    {
        digest.to_ascii_lowercase()
    } else {
        let tag = release["tag_name"].as_str().ok_or("Versión inválida")?;
        let checksum_url = format!("{DOWNLOAD_PREFIX}{tag}/SHA256SUMS");
        if !assets
            .iter()
            .any(|a| a["name"] == "SHA256SUMS" && a["browser_download_url"] == checksum_url)
        {
            return Err(
                "Esta versión aún no tiene un SHA-256 publicado. Inténtalo más tarde.".into(),
            );
        }
        let mut response = metadata_client
            .get(checksum_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if bytes.len() + chunk.len() > 128 * 1024 {
                return Err("Lista SHA-256 demasiado grande".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        checksum_from_list(
            std::str::from_utf8(&bytes).map_err(|_| "Lista SHA-256 inválida")?,
            filename,
        )?
    };
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("updates");
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let directory = tempfile::Builder::new()
        .prefix("libria-update-")
        .tempdir_in(cache)
        .map_err(|e| e.to_string())?;
    let installer = directory.path().join(filename);
    let response = client(Duration::from_secs(30 * 60))?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    download_to_file(response, &installer, total, &sha256, |value| {
        let _ = progress.send(value);
    })
    .await?;
    *prepared = Some(PreparedUpdate {
        _directory: directory,
        installer,
        sha256,
        version,
    });
    Ok(())
}

async fn download_to_file(
    mut response: reqwest::Response,
    installer: &Path,
    total: u64,
    sha256: &str,
    mut report: impl FnMut(DownloadProgress),
) -> Result<(), String> {
    let mut file = std::fs::File::create(installer).map_err(|e| e.to_string())?;
    let mut downloaded = 0;
    let mut last_progress = std::time::Instant::now();
    report(DownloadProgress { downloaded, total });
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        downloaded += chunk.len() as u64;
        if downloaded > total {
            return Err("El tamaño descargado no coincide con el publicado.".into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if last_progress.elapsed() >= Duration::from_millis(200) {
            report(DownloadProgress { downloaded, total });
            last_progress = std::time::Instant::now();
        }
    }
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    if downloaded != total {
        return Err("La descarga quedó incompleta. Vuelve a intentarlo.".into());
    }
    verify_file(installer, sha256)?;
    report(DownloadProgress { downloaded, total });
    Ok(())
}

#[cfg(windows)]
fn installer_arguments(directory: &Path, all_users: bool) -> Result<String, String> {
    let path = directory.to_str().ok_or("Ruta de instalación inválida")?;
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);
    if path.contains(['"', '\0', '\r', '\n']) || path.starts_with("UNC\\") {
        return Err("Ruta de instalación no compatible".into());
    }
    // NSIS requires /D= to be last and unquoted, even when it contains spaces.
    let scope = if all_users {
        "/AllUsers"
    } else {
        "/CurrentUser"
    };
    Ok(format!("/P /UPDATE /R {scope} /D={path}"))
}

#[cfg(windows)]
fn installed_for_all_users(directory: &Path) -> Result<bool, String> {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegGetValueW(
            key: *mut std::ffi::c_void,
            subkey: *const u16,
            value: *const u16,
            flags: u32,
            kind: *mut u32,
            data: *mut std::ffi::c_void,
            size: *mut u32,
        ) -> i32;
    }
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let key = wide(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Libria");
    let value = wide("InstallLocation");
    let expected = directory.canonicalize().map_err(|e| e.to_string())?;
    for (hive, all_users) in [(0x80000001u32, false), (0x80000002u32, true)] {
        let mut buffer = [0u16; 32768];
        let mut size = std::mem::size_of_val(&buffer) as u32;
        // SAFETY: predefined registry hive handles and valid writable UTF-16 buffers;
        // restrict the query to string values in the installer's 64-bit registry view.
        let result = unsafe {
            RegGetValueW(
                hive as i32 as isize as *mut _,
                key.as_ptr(),
                value.as_ptr(),
                0x00010002,
                std::ptr::null_mut(),
                buffer.as_mut_ptr().cast(),
                &mut size,
            )
        };
        if result != 0 {
            continue;
        }
        let length = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        let location = String::from_utf16_lossy(&buffer[..length]);
        if Path::new(location.trim_matches('"'))
            .canonicalize()
            .ok()
            .is_some_and(|path| {
                path.to_string_lossy().to_lowercase() == expected.to_string_lossy().to_lowercase()
            })
        {
            return Ok(all_users);
        }
    }
    Err("No se encontró esta instalación en el registro de Windows. Ejecuta el instalador manualmente.".into())
}

#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Updates>,
) -> Result<(), String> {
    let mut prepared = state
        .0
        .try_lock()
        .map_err(|_| "Ya hay una actualización en curso.")?;
    let update = prepared
        .as_ref()
        .ok_or("Descarga primero la actualización.")?;
    // Verify again immediately before launch, including retries after a declined UAC prompt.
    verify_file(&update.installer, &update.sha256)?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                window: *mut std::ffi::c_void,
                operation: *const u16,
                file: *const u16,
                parameters: *const u16,
                directory: *const u16,
                show: i32,
            ) -> isize;
        }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let directory = exe.parent().ok_or("Ruta de instalación inválida")?;
        if cfg!(debug_assertions) || !directory.join("uninstall.exe").is_file() {
            return Err(
                "Instala Libria con el instalador de Windows para usar la actualización integrada."
                    .into(),
            );
        }
        let parameters = installer_arguments(directory, installed_for_all_users(directory)?)?;
        let wide = |s: &std::ffi::OsStr| s.encode_wide().chain(Some(0)).collect::<Vec<_>>();
        let file = wide(update.installer.as_os_str());
        let parameters = wide(std::ffi::OsStr::new(&parameters));
        let operation = wide(std::ffi::OsStr::new("open"));
        // SAFETY: all strings are NUL-terminated and alive for this synchronous shell call.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                file.as_ptr(),
                parameters.as_ptr(),
                std::ptr::null(),
                1,
            )
        };
        if result <= 32 {
            return Err("No se inició el instalador. Si cancelaste el permiso de Windows, vuelve a intentarlo.".into());
        }
        if let Some(update) = prepared.take() {
            let _ = update._directory.keep();
        }
        app.state::<crate::speech::Speech>().shutdown();
        // Keep the temporary installer alive until NSIS has finished reading it.
        app.exit(0);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("La instalación integrada está disponible en Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksums_are_exact_and_a_modified_installer_is_rejected() {
        let hash = hex::encode(Sha256::digest(b"installer"));
        let list = format!("{hash}  libria.exe\n{hash} *other.exe\n");
        assert_eq!(checksum_from_list(&list, "libria.exe").unwrap(), hash);
        assert!(checksum_from_list(&list, "missing.exe").is_err());
        assert!(checksum_from_list(&format!("{list}{list}"), "libria.exe").is_err());
        assert!(checksum_from_list("bad  libria.exe", "libria.exe").is_err());
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("installer.exe");
        std::fs::write(&file, b"installer").unwrap();
        verify_file(&file, &hash).unwrap();
        std::fs::write(&file, b"tampered!").unwrap();
        assert!(verify_file(&file, &hash).is_err());
    }

    #[tokio::test]
    async fn downloads_verified_bytes_and_rejects_corrupt_incomplete_or_oversize_payloads() {
        use std::net::TcpListener;
        for (body, size, success) in [
            ("installer", 9, true),
            ("tampered!", 9, false),
            ("short", 9, false),
            ("extra bytes", 9, false),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut connection, _) = listener.accept().unwrap();
                connection
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0u8; 4096];
                connection.read(&mut request).unwrap();
                write!(
                    connection,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            });
            let response = reqwest::Client::new()
                .get(format!("http://{address}/installer.exe"))
                .send()
                .await
                .unwrap();
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join("installer.exe");
            let hash = hex::encode(Sha256::digest(b"installer"));
            let mut events = Vec::new();
            let result =
                download_to_file(response, &file, size, &hash, |value| events.push(value)).await;
            assert_eq!(result.is_ok(), success, "body: {body}");
            assert_eq!(events[0].downloaded, 0);
            if success {
                assert_eq!(events.last().unwrap().downloaded, size);
                assert_eq!(std::fs::read(file).unwrap(), b"installer");
            }
            server.join().unwrap();
        }
    }

    #[test]
    fn does_not_install_assets_from_another_tag_or_architecture() {
        let mut value = release();
        value["assets"][0]["browser_download_url"] = json!(
            "https://github.com/Gargadon/libria/releases/download/v9.9.9/libria-2.1.2-win-x64.exe"
        );
        let update =
            update_from_release(&value, &semver::Version::new(2, 1, 1), "windows", "x86_64")
                .unwrap()
                .unwrap();
        assert_eq!(update["canInstall"], false);
        assert_eq!(update["url"], RELEASES_URL);
        let update = update_from_release(
            &release(),
            &semver::Version::new(2, 1, 1),
            "windows",
            "aarch64",
        )
        .unwrap()
        .unwrap();
        assert_eq!(update["canInstall"], true);
        assert!(update["url"].as_str().unwrap().ends_with("win-arm64.exe"));
    }

    #[test]
    #[cfg(windows)]
    fn installer_reuses_the_current_directory_including_spaces_and_unicode() {
        assert_eq!(
            installer_arguments(Path::new(r"\\?\C:\Program Files\Libria"), true).unwrap(),
            r"/P /UPDATE /R /AllUsers /D=C:\Program Files\Libria"
        );
        assert_eq!(
            installer_arguments(Path::new(r"C:\Users\José\Libria"), false).unwrap(),
            r"/P /UPDATE /R /CurrentUser /D=C:\Users\José\Libria"
        );
        assert!(installer_arguments(Path::new("C:\\bad\"path"), false).is_err());
    }

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
