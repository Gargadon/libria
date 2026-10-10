//! Drive runs in Rust. Refresh tokens stay in the OS credential store, never in the WebView.
use crate::files::{self, MAX_BYTES};
use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use md5::Md5;
use rand::RngCore;
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{watch, Mutex},
};

const CLIENT_ID: &str = "109920984385-nj300o5c59enim5n2vicbo23p4khhs84.apps.googleusercontent.com";
const SCOPE: &str = "https://www.googleapis.com/auth/drive";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    client_id: String,
    access_token: String,
    refresh_token: String,
    scope: String,
    expires_at: u64,
    account: Value,
}

pub struct Drive {
    session: Mutex<Option<Session>>,
    cancel: watch::Sender<u64>,
    root: PathBuf,
    client: Client,
    app: tauri::AppHandle,
}

impl Drive {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, String> {
        let root = crate::data_dir(app)?.join("drive-cache");
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        Ok(Self {
            session: Mutex::new(None),
            cancel: watch::channel(0).0,
            root,
            app: app.clone(),
            client: Client::builder()
                .user_agent("Libria")
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|e| e.to_string())?,
        })
    }

    fn credentials(&self) -> Result<(String, String), String> {
        let mut config = Value::Null;
        let mut paths = vec![crate::data_dir(&self.app)?.join("google-drive-config.json")];
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                paths.push(dir.join("google-drive-config.json"));
            }
        }
        if cfg!(debug_assertions) {
            paths.push(
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../google-drive-config.json"),
            );
        }
        for path in paths {
            if path.is_file() {
                config = serde_json::from_str(&files::read_text(&path)?)
                    .map_err(|_| "google-drive-config.json inválido")?;
                break;
            }
        }
        let bundled = bundled_credentials()?;
        let id = std::env::var("LIBRIA_GOOGLE_CLIENT_ID")
            .ok()
            .or_else(|| config["client_id"].as_str().map(str::to_owned))
            .or_else(|| bundled["clientId"].as_str().map(str::to_owned))
            .unwrap_or_else(|| CLIENT_ID.into());
        let secret = std::env::var("LIBRIA_GOOGLE_CLIENT_SECRET")
            .ok()
            .or_else(|| config["client_secret"].as_str().map(str::to_owned))
            .or_else(|| {
                (bundled["clientId"] == id)
                    .then(|| bundled["clientSecret"].as_str().map(str::to_owned))
                    .flatten()
            })
            .unwrap_or_default();
        if !id.ends_with(".apps.googleusercontent.com") {
            return Err("Configuración OAuth inválida".into());
        }
        Ok((id, secret))
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("com.libria.app", "google-drive")
            .map_err(|_| "No hay un almacén seguro de credenciales disponible".into())
    }

    fn restore(&self, session: &mut Option<Session>) -> Result<(), String> {
        if session.is_some() {
            return Ok(());
        }
        match self.entry()?.get_password() {
            Ok(value) => {
                let saved: Session = serde_json::from_str(&value)
                    .map_err(|_| "Credenciales dañadas. Desconecta y vuelve a conectar Drive")?;
                if saved.client_id == self.credentials()?.0 {
                    *session = Some(saved);
                }
            }
            Err(keyring::Error::NoEntry) => {}
            Err(_) => {
                return Err(
                    "No se pudo abrir el llavero del sistema. Desbloquéalo e inténtalo de nuevo"
                        .into(),
                )
            }
        }
        Ok(())
    }

    fn persist(&self, session: &Session) -> Result<(), String> {
        self.entry()?
            .set_password(&serde_json::to_string(session).map_err(|e| e.to_string())?)
            .map_err(|_| "No se pudieron guardar las credenciales en el llavero del sistema".into())
    }

    fn status(&self, session: &Option<Session>) -> Result<Value, String> {
        Ok(
            json!({ "configured": !self.credentials()?.1.trim().is_empty(), "connected": session.is_some(),
            "account": session.as_ref().map(|s| &s.account),
            "writable": session.as_ref().is_some_and(|s| s.scope.split_whitespace().any(|v| v == SCOPE)) }),
        )
    }

    async fn response(
        &self,
        request: reqwest::RequestBuilder,
        limit: usize,
    ) -> Result<String, String> {
        let mut response = request
            .send()
            .await
            .map_err(|_| "No se pudo conectar con Google Drive")?;
        let status = response.status();
        if response.content_length().is_some_and(|n| n > limit as u64) {
            return Err("La respuesta supera el tamaño permitido".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "La descarga de Drive se interrumpió")?
        {
            if bytes.len() + chunk.len() > limit {
                return Err("La respuesta supera el tamaño permitido".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        if !status.is_success() {
            let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
            if value["error"] == "invalid_grant" {
                return Err("La autorización de Google caducó o fue revocada. Desconecta y vuelve a conectar".into());
            }
            return Err(format!("Google Drive: HTTP {}", status.as_u16()));
        }
        String::from_utf8(bytes).map_err(|_| "Respuesta de Google inválida".into())
    }

    async fn token(&self, fields: &[(&str, &str)]) -> Result<Value, String> {
        let (id, secret) = self.credentials()?;
        if secret.trim().is_empty() {
            return Err("Añade client_secret en google-drive-config.json y reinicia Libria".into());
        }
        let mut form = vec![
            ("client_id", id.as_str()),
            ("client_secret", secret.as_str()),
        ];
        form.extend_from_slice(fields);
        let text = self
            .response(
                self.client
                    .post("https://oauth2.googleapis.com/token")
                    .form(&form),
                1024 * 1024,
            )
            .await?;
        let token: Value = serde_json::from_str(&text).map_err(|_| "Respuesta OAuth inválida")?;
        if token["access_token"].as_str().is_none() || token["expires_in"].as_u64().is_none() {
            return Err("Respuesta OAuth inválida".into());
        }
        Ok(token)
    }

    async fn access_token(&self, session: &mut Option<Session>) -> Result<String, String> {
        self.restore(session)?;
        let saved = session
            .as_ref()
            .ok_or("Conecta una cuenta de Google Drive primero")?;
        if saved.expires_at > now() + 60 {
            return Ok(saved.access_token.clone());
        }
        let token = match self
            .token(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", &saved.refresh_token),
            ])
            .await
        {
            Ok(token) => token,
            Err(error) => {
                if error.starts_with("La autorización de Google caducó") {
                    *session = None;
                    let _ = self.entry()?.delete_credential();
                }
                return Err(error);
            }
        };
        let saved = session
            .as_ref()
            .ok_or("Conecta una cuenta de Google Drive primero")?;
        let mut updated = saved.clone();
        updated.access_token = token["access_token"].as_str().unwrap().into();
        if let Some(refresh) = token["refresh_token"].as_str() {
            updated.refresh_token = refresh.into();
        }
        updated.expires_at = now() + token["expires_in"].as_u64().unwrap();
        self.persist(&updated)?;
        let bearer = updated.access_token.clone();
        *session = Some(updated);
        Ok(bearer)
    }

    async fn api(
        &self,
        session: &mut Option<Session>,
        method: Method,
        route: &str,
        body: Option<(String, String)>,
        upload: bool,
    ) -> Result<String, String> {
        let bearer = self.access_token(session).await?;
        let url = format!(
            "https://www.googleapis.com/{}drive/v3/{}",
            if upload { "upload/" } else { "" },
            route
        );
        let mut request = self.client.request(method, url).bearer_auth(bearer);
        if let Some((content_type, body)) = body {
            request = request.header("Content-Type", content_type).body(body);
        }
        self.response(request, MAX_BYTES).await
    }

    async fn connect(&self, session: &mut Option<Session>) -> Result<Value, String> {
        let (client_id, secret) = self.credentials()?;
        if secret.trim().is_empty() {
            return Err("Configura client_secret antes de conectar Google Drive".into());
        }
        // Verify secure storage before opening an authorization window.
        match self.entry()?.get_password() {
            Ok(_) | Err(keyring::Error::NoEntry) => {}
            Err(_) => {
                return Err("Desbloquea el llavero del sistema antes de conectar Drive".into())
            }
        }
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| "No se pudo iniciar la autorización local")?;
        let redirect = format!(
            "http://127.0.0.1:{}/oauth/callback",
            listener.local_addr().map_err(|e| e.to_string())?.port()
        );
        let state = random(32);
        let verifier = random(64);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
        url.query_pairs_mut().extend_pairs([
            ("client_id", client_id.as_str()),
            ("redirect_uri", &redirect),
            ("response_type", "code"),
            ("scope", SCOPE),
            ("state", &state),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent select_account"),
        ]);
        self.app
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|_| "No se pudo abrir el navegador")?;
        let code = tokio::time::timeout(Duration::from_secs(180), callback(&listener, &state))
            .await
            .map_err(|_| "La autorización de Google tardó demasiado")??;
        let token = self
            .token(&[
                ("grant_type", "authorization_code"),
                ("code", &code),
                ("code_verifier", &verifier),
                ("redirect_uri", &redirect),
            ])
            .await?;
        let refresh_token = token["refresh_token"]
            .as_str()
            .ok_or("Google no devolvió un token de renovación. Vuelve a autorizar")?
            .to_owned();
        let access_token = token["access_token"].as_str().unwrap().to_owned();
        let about = self.response(self.client.get("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)")
            .bearer_auth(&access_token), 1024 * 1024).await?;
        let about: Value =
            serde_json::from_str(&about).map_err(|_| "Respuesta de Google inválida")?;
        let saved = Session {
            client_id,
            access_token,
            refresh_token,
            scope: token["scope"].as_str().unwrap_or("").into(),
            expires_at: now() + token["expires_in"].as_u64().unwrap(),
            account: json!({ "name": about["user"]["displayName"].as_str().unwrap_or("Google Drive"), "email": about["user"]["emailAddress"].as_str().unwrap_or("") }),
        };
        self.persist(&saved)?;
        *session = Some(saved);
        self.status(session)
    }

    async fn metadata(&self, session: &mut Option<Session>, id: &str) -> Result<Value, String> {
        validate_id(id)?;
        let text = self.api(session, Method::GET, &format!("files/{id}?fields=id,name,size,version,md5Checksum,trashed,capabilities(canDownload,canEdit)"), None, false).await?;
        serde_json::from_str(&text).map_err(|_| "Metadatos de Drive inválidos".into())
    }

    fn cache_path(&self, account: &str, id: &str) -> Result<PathBuf, String> {
        validate_id(id)?;
        if account.is_empty() || account.len() > 1024 {
            return Err("Cuenta de Drive inválida".into());
        }
        Ok(self
            .root
            .join(hex::encode(Sha256::digest(account.as_bytes())))
            .join(format!("{id}.libria")))
    }

    fn cached_link(&self, path: &str) -> Value {
        let path = PathBuf::from(path);
        let Ok(resolved) = path.canonicalize() else {
            return Value::Null;
        };
        let Ok(root) = self.root.canonicalize() else {
            return Value::Null;
        };
        if !resolved.starts_with(root) || resolved.extension().is_none_or(|ext| ext != "libria") {
            return Value::Null;
        }
        files::read_text(&PathBuf::from(format!(
            "{}.link.json",
            path.to_string_lossy()
        )))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
    }

    fn cache_file(&self, link: &Value, content: &str) -> Result<Value, String> {
        validate_content(content)?;
        let path = self.cache_path(field(link, "account")?, field(link, "id")?)?;
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        let sidecar = json!({ "id": link["id"], "name": link["name"], "account": link["account"], "version": link["version"], "baseline": link["baseline"] });
        files::atomic_write(&path, content.as_bytes())?;
        files::atomic_write(
            &PathBuf::from(format!("{}.link.json", path.to_string_lossy())),
            &serde_json::to_vec(&sidecar).unwrap(),
        )?;
        Ok(json!(path.to_string_lossy()))
    }

    async fn dispatch(
        &self,
        method: &str,
        args: &[Value],
        session: &mut Option<Session>,
    ) -> Result<Value, String> {
        // Cache operations remain usable offline, including when the credential store is locked.
        match method {
            "cacheFile" => {
                return self.cache_file(args.first().ok_or("Vínculo inválido")?, argument(args, 1)?)
            }
            "cachedLink" => return Ok(self.cached_link(argument(args, 0)?)),
            "connect" => return self.connect(session).await,
            "disconnect" => {
                let _ = self.restore(session);
                let refresh = session.as_ref().map(|s| s.refresh_token.clone());
                match self.entry()?.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => {
                        return Err("No se pudieron eliminar las credenciales del llavero".into())
                    }
                }
                *session = None;
                let revoked = if let Some(refresh) = refresh {
                    self.response(
                        self.client
                            .post("https://oauth2.googleapis.com/revoke")
                            .form(&[("token", refresh)]),
                        1024 * 1024,
                    )
                    .await
                    .is_ok()
                } else {
                    true
                };
                return Ok(json!({ "revoked": revoked }));
            }
            _ => {}
        }
        self.restore(session)?;
        match method {
            "status" => self.status(session),
            "listFiles" => {
                let route = {
                    let mut params = url::form_urlencoded::Serializer::new(String::new());
                    params.extend_pairs([
                    ("q", "trashed = false and mimeType != 'application/vnd.google-apps.folder' and name contains '.libria'"),
                    ("fields", "nextPageToken,files(id,name,modifiedTime,size,capabilities(canDownload))"), ("pageSize", "100"), ("orderBy", "modifiedTime desc"),
                ]);
                    if let Some(cursor) = args.first().and_then(Value::as_str) {
                        if cursor.len() > 4096 {
                            return Err("Cursor inválido".into());
                        }
                        params.append_pair("pageToken", cursor);
                    }
                    format!("files?{}", params.finish())
                };
                let text = self.api(session, Method::GET, &route, None, false).await?;
                let data: Value =
                    serde_json::from_str(&text).map_err(|_| "Respuesta de Drive inválida")?;
                let files: Vec<&Value> = data["files"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|f| is_document(f))
                    .collect();
                Ok(json!({ "files": files, "nextPageToken": data["nextPageToken"] }))
            }
            "fileMetadata" => self.metadata(session, argument(args, 0)?).await,
            "readFile" => {
                let id = argument(args, 0)?;
                let account = account(session)?.to_owned();
                let destination = self.cache_path(&account, id)?;
                if !args.get(1).and_then(Value::as_bool).unwrap_or(false) {
                    let mut cached = self.cached_link(&destination.to_string_lossy());
                    if let Some(baseline) = cached["baseline"].as_str() {
                        let content = files::read_text(&destination)?;
                        if baseline != content {
                            cached["content"] = json!(content);
                            return Ok(cached);
                        }
                    }
                }
                let metadata = self.metadata(session, id).await?;
                if !is_document(&metadata)
                    || metadata["capabilities"]["canDownload"] == false
                    || metadata["trashed"] == true
                {
                    return Err("El archivo no es un documento .libria descargable".into());
                }
                if metadata["size"]
                    .as_str()
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0)
                    > MAX_BYTES as u64
                {
                    return Err("El archivo supera 100 MB".into());
                }
                let content = self
                    .api(
                        session,
                        Method::GET,
                        &format!("files/{id}?alt=media"),
                        None,
                        false,
                    )
                    .await?;
                let after = self.metadata(session, id).await?;
                if metadata["version"] != after["version"] {
                    return Err(
                        "El documento cambió durante la descarga. Inténtalo de nuevo".into(),
                    );
                }
                checksum(&metadata, &content)?;
                Ok(
                    json!({ "id": id, "name": metadata["name"], "content": content, "version": metadata["version"], "account": account }),
                )
            }
            "writeFile" => {
                let id = argument(args, 0)?;
                let version = argument(args, 1)?;
                let content = argument(args, 2)?;
                let expected_account = argument(args, 3)?;
                if account(session)? != expected_account {
                    return Err("Conecta la cuenta de Drive de este documento".into());
                }
                validate_content(content)?;
                self.require_writable(session)?;
                let metadata = self.metadata(session, id).await?;
                if version.is_empty() || metadata["version"] != version {
                    return Ok(json!({ "conflict": true }));
                }
                if !is_document(&metadata)
                    || metadata["trashed"] == true
                    || metadata["capabilities"]["canEdit"] == false
                {
                    return Err("No se puede editar este archivo en Drive".into());
                }
                // Like the existing implementation, observed version checks are not an atomic CAS.
                let text = self
                    .api(
                        session,
                        Method::PATCH,
                        &format!("files/{id}?uploadType=media&fields=id,name,version,md5Checksum"),
                        Some(("application/json".into(), content.into())),
                        true,
                    )
                    .await?;
                let mut result: Value =
                    serde_json::from_str(&text).map_err(|_| "Respuesta de Drive inválida")?;
                if result["version"].as_str().is_none() {
                    return Err("No se pudo confirmar la versión guardada. La copia local permanece intacta".into());
                }
                checksum(&result, content)?;
                result["conflict"] = json!(false);
                result["account"] = json!(expected_account);
                Ok(result)
            }
            "createFile" => {
                let name = argument(args, 0)?;
                let content = argument(args, 1)?;
                if name.len() > 800 || !name.to_lowercase().ends_with(".libria") {
                    return Err("Nombre inválido".into());
                }
                validate_content(content)?;
                self.require_writable(session)?;
                let boundary = format!("libria_{}", random(24));
                let body = format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n{content}\r\n--{boundary}--", json!({ "name": name, "mimeType": "application/json" }));
                let text = self
                    .api(
                        session,
                        Method::POST,
                        "files?uploadType=multipart&fields=id,name,version",
                        Some((format!("multipart/related; boundary={boundary}"), body)),
                        true,
                    )
                    .await?;
                let mut result: Value =
                    serde_json::from_str(&text).map_err(|_| "Respuesta de Drive inválida")?;
                result["account"] = json!(account(session)?);
                Ok(result)
            }
            _ => Err("Operación de Drive inválida".into()),
        }
    }

    fn require_writable(&self, session: &Option<Session>) -> Result<(), String> {
        if !session
            .as_ref()
            .is_some_and(|s| s.scope.split_whitespace().any(|v| v == SCOPE))
        {
            return Err(
                "Vuelve a conectar Drive para autorizar el guardado y la sincronización".into(),
            );
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn drive(
    state: tauri::State<'_, Drive>,
    method: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    if method == "cancel" || method == "disconnect" {
        state
            .cancel
            .send_modify(|generation| *generation = generation.wrapping_add(1));
        if method == "cancel" {
            return Ok(Value::Null);
        }
    }
    let mut cancel = state.cancel.subscribe();
    tokio::select! {
        biased;
        _ = cancel.changed() => Err("Operación de Drive cancelada".into()),
        result = async {
            let mut session = state.session.lock().await;
            state.dispatch(&method, &args, &mut session).await
        } => result,
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random(count: usize) -> String {
    let mut bytes = vec![0; count];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn argument(args: &[Value], index: usize) -> Result<&str, String> {
    args.get(index)
        .and_then(Value::as_str)
        .ok_or_else(|| "Argumento de Drive inválido".into())
}
fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .ok_or_else(|| "Vínculo de Drive inválido".into())
}
fn account(session: &Option<Session>) -> Result<&str, String> {
    session
        .as_ref()
        .and_then(|s| s.account["email"].as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Conecta una cuenta de Google Drive primero".into())
}
fn is_document(metadata: &Value) -> bool {
    metadata["name"]
        .as_str()
        .is_some_and(|s| s.to_lowercase().ends_with(".libria"))
}
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 256
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Identificador de Drive inválido".into());
    }
    Ok(())
}
fn validate_content(content: &str) -> Result<(), String> {
    if content.len() > MAX_BYTES {
        return Err("El documento supera 100 MB".into());
    }
    let value: Value = serde_json::from_str(content).map_err(|_| "Documento Libria inválido")?;
    if value["libriaVersion"].as_str().is_none() {
        return Err("Documento Libria inválido".into());
    }
    Ok(())
}
fn checksum(metadata: &Value, content: &str) -> Result<(), String> {
    if let Some(expected) = metadata["md5Checksum"].as_str() {
        if expected != hex::encode(Md5::digest(content.as_bytes())) {
            return Err("El contenido no coincide con la versión de Drive. La copia local permanece intacta".into());
        }
    }
    Ok(())
}

fn bundled_credentials() -> Result<Value, String> {
    let blob: Value = serde_json::from_str(include_str!("../oauth-credentials.json"))
        .map_err(|_| "Blob OAuth inválido")?;
    if blob.is_null() {
        return Ok(Value::Null);
    }
    let decode = |value: &Value| {
        hex::decode(value.as_str().unwrap_or("")).map_err(|_| "Blob OAuth inválido".to_string())
    };
    let first = decode(&blob["shares"][0])?;
    let second = decode(&blob["shares"][1])?;
    let nonce = decode(&blob["nonce"])?;
    let tag = decode(&blob["tag"])?;
    if blob["version"] != 1
        || first.len() != 32
        || second.len() != 32
        || nonce.len() != 12
        || tag.len() != 16
    {
        return Err("Blob OAuth inválido".into());
    }
    let key: Vec<u8> = first.iter().zip(&second).map(|(a, b)| a ^ b).collect();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "Blob OAuth inválido")?;
    let mut ciphertext = decode(&blob["ciphertext"])?;
    ciphertext.extend_from_slice(&tag);
    let plaintext = cipher
        .decrypt(aes_gcm::Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "Blob OAuth incluido dañado")?;
    serde_json::from_slice(&plaintext).map_err(|_| "Blob OAuth incluido dañado".into())
}

async fn callback(listener: &TcpListener, state: &str) -> Result<String, String> {
    loop {
        let (mut socket, _) = listener
            .accept()
            .await
            .map_err(|_| "No se pudo recibir la autorización")?;
        let request = tokio::time::timeout(Duration::from_secs(5), async {
            let mut bytes = Vec::new();
            let mut chunk = [0; 1024];
            loop {
                let count = socket.read(&mut chunk).await.map_err(|_| ())?;
                if count == 0 || bytes.len() + count > 8192 {
                    return Err(());
                }
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.windows(4).any(|part| part == b"\r\n\r\n") {
                    return Ok(bytes);
                }
            }
        })
        .await;
        let bytes = match request {
            Ok(Ok(bytes)) => bytes,
            _ => continue,
        };
        let request = String::from_utf8_lossy(&bytes);
        let mut parts = request.lines().next().unwrap_or("").split_whitespace();
        let method = parts.next().unwrap_or("");
        let target = parts.next().unwrap_or("");
        let parsed = url::Url::parse(&format!("http://127.0.0.1{target}"));
        let valid = parsed.as_ref().is_ok_and(|u| {
            method == "GET"
                && u.path() == "/oauth/callback"
                && u.query_pairs().any(|(k, v)| k == "state" && v == state)
        });
        let body = if valid {
            "Autorización recibida. Vuelve a Libria para completar la conexión."
        } else {
            "Solicitud inválida."
        };
        let reply = format!("HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", if valid { "200 OK" } else { "400 Bad Request" }, body.len());
        let _ = socket.write_all(reply.as_bytes()).await;
        if valid {
            return parsed
                .unwrap()
                .query_pairs()
                .find(|(k, _)| k == "code")
                .map(|(_, v)| v.into_owned())
                .filter(|v| !v.is_empty())
                .ok_or_else(|| "Google no autorizó la conexión".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_traversal_ids_and_non_libria_content() {
        assert!(validate_id("../book").is_err());
        assert!(validate_id("book?alt=media").is_err());
        assert!(validate_id("valid_Book-123").is_ok());
        assert!(validate_content("{}").is_err());
        assert!(validate_content(r#"{"libriaVersion":"1"}"#).is_ok());
    }
    #[test]
    fn bundled_blob_decrypts_without_exposing_credentials() {
        let value = bundled_credentials().unwrap();
        assert!(
            value.is_null()
                || value["clientId"]
                    .as_str()
                    .is_some_and(|s| s.ends_with(".apps.googleusercontent.com"))
        );
    }
    #[test]
    fn verifies_download_checksums() {
        assert!(checksum(&json!({"md5Checksum": "wrong"}), "content").is_err());
        assert!(checksum(
            &json!({"md5Checksum": hex::encode(Md5::digest(b"content"))}),
            "content"
        )
        .is_ok());
    }
    #[tokio::test]
    async fn oauth_callback_rejects_wrong_state_and_accepts_fragmented_requests() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { callback(&listener, "expected-state").await });
        let client = Client::new();
        let invalid = client
            .get(format!(
                "http://{address}/oauth/callback?state=wrong&code=wrong-code"
            ))
            .send()
            .await
            .unwrap();
        assert_eq!(invalid.status(), reqwest::StatusCode::BAD_REQUEST);
        let mut socket = tokio::net::TcpStream::connect(address).await.unwrap();
        socket
            .write_all(b"GET /oauth/callback?state=expected-state&code=fixture")
            .await
            .unwrap();
        tokio::task::yield_now().await;
        socket
            .write_all(b"-code HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .unwrap();
        let mut reply = String::new();
        socket.read_to_string(&mut reply).await.unwrap();
        assert!(reply.starts_with("HTTP/1.1 200"));
        assert_eq!(task.await.unwrap().unwrap(), "fixture-code");
    }
}
