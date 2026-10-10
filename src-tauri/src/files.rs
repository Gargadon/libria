use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MAX_BYTES: usize = 100 * 1024 * 1024;

pub fn document_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute()
        || value.contains('\0')
        || !path.extension().is_some_and(|ext| {
            ["libria", "libria-theme", "json"]
                .iter()
                .any(|allowed| ext.eq_ignore_ascii_case(allowed))
        })
    {
        return Err("Ruta de documento inválida".into());
    }
    Ok(path)
}

pub fn read_text(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_BYTES as u64 {
        return Err("Archivo inválido o mayor de 100 MB".into());
    }
    let mut text = String::new();
    file.take(MAX_BYTES as u64 + 1)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() > MAX_BYTES {
        return Err("El archivo supera 100 MB".into());
    }
    Ok(text)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_BYTES {
        return Err("El archivo supera 100 MB".into());
    }
    let parent = path.parent().ok_or("Ruta inválida")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(bytes).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_save_replaces_existing_file_without_leaving_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.libria");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, "segundo — ñ".as_bytes()).unwrap();
        assert_eq!(read_text(&path).unwrap(), "segundo — ñ");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn rejects_paths_that_are_not_documents() {
        assert!(document_path("relative.libria").is_err());
        assert!(
            document_path(&std::env::temp_dir().join("program.exe").to_string_lossy()).is_err()
        );
    }
}
