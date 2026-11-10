//! Small RAII wrapper over the upstream Vosk C ABI. All calls stay on the owning worker.
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    path::Path,
};

type NewModel = unsafe extern "C" fn(*const c_char) -> *mut c_void;
type Free = unsafe extern "C" fn(*mut c_void);
type NewRecognizer = unsafe extern "C" fn(*mut c_void, f32) -> *mut c_void;
type Accept = unsafe extern "C" fn(*mut c_void, *const i16, c_int) -> c_int;
type ResultFn = unsafe extern "C" fn(*mut c_void) -> *const c_char;

/// Probe the ABI before selecting a system package over the pinned fallback.
#[cfg(target_os = "linux")]
pub fn compatible_library(path: &Path) -> bool {
    // SAFETY: callers supply only absolute paths from standard system library directories.
    unsafe {
        let Ok(library) = Library::new(path) else {
            return false;
        };
        [
            b"vosk_model_new\0".as_slice(),
            b"vosk_model_free\0",
            b"vosk_recognizer_new\0",
            b"vosk_recognizer_free\0",
            b"vosk_recognizer_accept_waveform_s\0",
            b"vosk_recognizer_result\0",
            b"vosk_recognizer_partial_result\0",
            b"vosk_recognizer_final_result\0",
            b"vosk_set_log_level\0",
        ]
        .iter()
        .all(|symbol| library.get::<*const c_void>(symbol).is_ok())
    }
}

pub struct Engine {
    // The library outlives every function pointer and native object, including Drop.
    _library: Library,
    model: *mut c_void,
    recognizer: *mut c_void,
    free_model: Free,
    free_recognizer: Free,
    accept: Accept,
    result: ResultFn,
    partial: ResultFn,
    final_result: ResultFn,
}
impl Engine {
    pub fn new(library_path: &Path, model_path: &Path, sample_rate: u32) -> Result<Self, String> {
        let path = CString::new(model_path.to_string_lossy().as_bytes()).map_err(|_| "model")?;
        // SAFETY: only a SHA-256 verified, pinned library is loaded, with the documented Vosk ABI.
        unsafe {
            #[cfg(windows)]
            let library: Library =
                libloading::os::windows::Library::load_with_flags(library_path, 0x100 | 0x1000)
                    .map_err(|_| "runtime")?
                    .into();
            #[cfg(not(windows))]
            let library = Library::new(library_path).map_err(|_| "runtime")?;
            let new_model: NewModel = *library.get(b"vosk_model_new\0").map_err(|_| "runtime")?;
            let new_recognizer: NewRecognizer = *library
                .get(b"vosk_recognizer_new\0")
                .map_err(|_| "runtime")?;
            let free_model: Free = *library.get(b"vosk_model_free\0").map_err(|_| "runtime")?;
            let free_recognizer: Free = *library
                .get(b"vosk_recognizer_free\0")
                .map_err(|_| "runtime")?;
            let accept: Accept = *library
                .get(b"vosk_recognizer_accept_waveform_s\0")
                .map_err(|_| "runtime")?;
            let result: ResultFn = *library
                .get(b"vosk_recognizer_result\0")
                .map_err(|_| "runtime")?;
            let partial: ResultFn = *library
                .get(b"vosk_recognizer_partial_result\0")
                .map_err(|_| "runtime")?;
            let final_result: ResultFn = *library
                .get(b"vosk_recognizer_final_result\0")
                .map_err(|_| "runtime")?;
            let log: unsafe extern "C" fn(c_int) = *library
                .get(b"vosk_set_log_level\0")
                .map_err(|_| "runtime")?;
            log(-1);
            let model = new_model(path.as_ptr());
            if model.is_null() {
                return Err("model".into());
            }
            let recognizer = new_recognizer(model, sample_rate as f32);
            if recognizer.is_null() {
                free_model(model);
                return Err("model".into());
            }
            Ok(Self {
                _library: library,
                model,
                recognizer,
                free_model,
                free_recognizer,
                accept,
                result,
                partial,
                final_result,
            })
        }
    }
    pub fn feed(&mut self, samples: &[i16]) -> Result<(bool, String), String> {
        let length = c_int::try_from(samples.len()).map_err(|_| "failed")?;
        // SAFETY: recognizer is alive, and the slice is valid for this synchronous call.
        let status = unsafe { (self.accept)(self.recognizer, samples.as_ptr(), length) };
        if status < 0 {
            return Err("failed".into());
        }
        let complete = status == 1;
        Ok((
            complete,
            self.text(
                if complete { self.result } else { self.partial },
                if complete { "text" } else { "partial" },
            )?,
        ))
    }
    pub fn finish(&mut self) -> Result<String, String> {
        self.text(self.final_result, "text")
    }
    fn text(&self, function: ResultFn, key: &str) -> Result<String, String> {
        // SAFETY: Vosk owns the returned NUL-terminated string until its next call.
        let value = unsafe {
            let ptr = function(self.recognizer);
            if ptr.is_null() {
                return Err("failed".into());
            }
            CStr::from_ptr(ptr).to_str().map_err(|_| "failed")?
        };
        let result: serde_json::Value = serde_json::from_str(value).map_err(|_| "failed")?;
        Ok(result
            .get(key)
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .trim()
            .into())
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        // SAFETY: these objects were created by this library, and freed exactly once.
        unsafe {
            (self.free_recognizer)(self.recognizer);
            (self.free_model)(self.model);
        }
    }
}
