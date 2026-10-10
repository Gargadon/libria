use base64::{engine::general_purpose::STANDARD, Engine};
use fontdb::{Database, Style};
use serde::Serialize;
use std::{collections::BTreeSet, sync::OnceLock};

fn database() -> &'static Database {
    static DATABASE: OnceLock<Database> = OnceLock::new();
    DATABASE.get_or_init(|| {
        let mut db = Database::new();
        db.load_system_fonts();
        db
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontVariant {
    data: String,
    mime_type: &'static str,
    style: &'static str,
    weight: String,
}

#[tauri::command]
pub async fn system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        database()
            .faces()
            .flat_map(|f| f.families.iter().map(|(name, _)| name.clone()))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn font_variants(family: String) -> Result<Vec<FontVariant>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = database();
        db.faces()
            .filter(|f| f.families.iter().any(|(name, _)| name == &family))
            .filter_map(|face| {
                let bytes = db.with_face_data(face.id, standalone_font)??;
                Some(FontVariant {
                    mime_type: if bytes.starts_with(b"OTTO") {
                        "font/otf"
                    } else {
                        "font/ttf"
                    },
                    data: STANDARD.encode(bytes),
                    style: match face.style {
                        Style::Normal => "normal",
                        Style::Italic => "italic",
                        Style::Oblique => "oblique",
                    },
                    weight: face.weight.0.to_string(),
                })
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

// A collection can contain several families. Extract the selected face so that
// browser font loading and document exports do not accidentally use its first face.
fn standalone_font(data: &[u8], index: u32) -> Option<Vec<u8>> {
    if !data.starts_with(b"ttcf") {
        return Some(data.to_vec());
    }
    let u32_at = |offset| {
        Some(u32::from_be_bytes(
            data.get(offset..offset + 4)?.try_into().ok()?,
        ))
    };
    if index >= u32_at(8)? {
        return None;
    }
    let start = u32_at(12 + index as usize * 4)? as usize;
    let header = data.get(start..start + 12)?;
    let count = u16::from_be_bytes(header[4..6].try_into().ok()?) as usize;
    let mut out = data.get(start..start + 12 + count * 16)?.to_vec();
    let mut head = None;
    for i in 0..count {
        let record = 12 + i * 16;
        let source = u32_at(start + record + 8)? as usize;
        let length = u32_at(start + record + 12)? as usize;
        let offset = out.len();
        out[record + 8..record + 12].copy_from_slice(&u32::try_from(offset).ok()?.to_be_bytes());
        out.extend_from_slice(data.get(source..source.checked_add(length)?)?);
        if &out[record..record + 4] == b"head" {
            if length < 12 {
                return None;
            }
            head = Some(offset);
            out[offset + 8..offset + 12].fill(0);
        }
        while out.len() % 4 != 0 {
            out.push(0);
        }
    }
    if let Some(offset) = head {
        let sum = out.chunks_exact(4).fold(0u32, |sum, word| {
            sum.wrapping_add(u32::from_be_bytes(word.try_into().unwrap()))
        });
        out[offset + 8..offset + 12]
            .copy_from_slice(&0xB1B0AFBAu32.wrapping_sub(sum).to_be_bytes());
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_fonts_can_be_embedded() {
        let db = database();
        assert!(!db.is_empty(), "No installed fonts detected");
        for face in db.faces() {
            let bytes = db
                .with_face_data(face.id, standalone_font)
                .flatten()
                .unwrap();
            assert!(bytes.starts_with(b"OTTO") || bytes.starts_with(&[0, 1, 0, 0]));
            let mut extracted = Database::new();
            extracted.load_font_data(bytes);
            assert_eq!(extracted.len(), 1);
            assert_eq!(
                extracted.faces().next().unwrap().post_script_name,
                face.post_script_name
            );
        }
    }

    #[test]
    fn malformed_collections_are_rejected() {
        assert!(standalone_font(b"ttcf", 0).is_none());
        assert!(standalone_font(b"ttcf\0\x01\0\0\0\0\0\0", 0).is_none());
    }
}
