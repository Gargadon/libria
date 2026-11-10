//! Native, offline dictation: the audio callback only downmixes/enqueues; decoding runs off the UI thread.
mod assets;
mod decoder;
mod engine;

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, Sample, SizedSample,
};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, Manager};

#[derive(Clone, Serialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Loading,
    Listening,
    Partial { text: String },
    Final { text: String },
    Error { code: String },
    Ended,
}
type Sink = dyn Fn(Event) + Send + Sync;
struct Session {
    id: String,
    control: Arc<AtomicU8>,
}
#[derive(Default)]
pub struct Speech(Mutex<Option<Session>>);
impl Speech {
    fn stop(&self, id: &str, abort: bool) {
        if let Some(session) = self.0.lock().unwrap().as_ref().filter(|s| s.id == id) {
            session
                .control
                .fetch_max(if abort { 2 } else { 1 }, Ordering::AcqRel);
        }
    }
    pub fn shutdown(&self) {
        if let Some(session) = self.0.lock().unwrap().as_ref() {
            session.control.store(2, Ordering::Release);
        }
    }
}

/// CI smoke check: load all packaged models without initializing a window, microphone, or network.
pub fn verify_resources(root: &std::path::Path) -> Result<(), String> {
    for language in ["en", "fr", "it", "de", "pt", "es"] {
        let assets = assets::resolve(root, language)?;
        let mut engine = decoder::Decoder::new(
            &assets.library,
            &assets.model,
            16000,
            assets.host.as_deref(),
        )?;
        engine.feed(&[0i16; 1600])?;
        engine.finish()?;
        println!("Vosk offline: {language}");
    }
    Ok(())
}

#[tauri::command]
pub fn speech_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<Speech>,
    id: String,
    lang: String,
    events: Channel<Event>,
) -> Result<(), String> {
    if window.label() != "main" || id.is_empty() || id.len() > 128 {
        return Err("failed".into());
    }
    assets::model_for_language(&lang)?;
    #[cfg(debug_assertions)]
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../build/tauri-resources/vosk");
    #[cfg(not(debug_assertions))]
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| "resources")?
        .join("runtime/vosk");
    let control = Arc::new(AtomicU8::new(0));
    {
        let mut current = state.0.lock().unwrap();
        if current.is_some() {
            return Err("busy".into());
        }
        *current = Some(Session {
            id: id.clone(),
            control: control.clone(),
        });
    }
    let worker_app = app.clone();
    let worker_id = id.clone();
    if std::thread::Builder::new()
        .name("libria-dictation".into())
        .spawn(move || {
            let sink_control = control.clone();
            let sink = move |event| {
                if events.send(event).is_err() {
                    sink_control.store(2, Ordering::Release);
                }
            };
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run(root, &lang, &control, &sink)
            }));
            if control.load(Ordering::Acquire) != 2 {
                match result {
                    Ok(Err(code)) if code != "cancelled" => sink(Event::Error { code }),
                    Err(_) => sink(Event::Error {
                        code: "failed".into(),
                    }),
                    _ => {}
                }
            }
            {
                let state = worker_app.state::<Speech>();
                let mut current = state.0.lock().unwrap();
                if current.as_ref().is_some_and(|s| s.id == worker_id) {
                    *current = None;
                }
            }
            sink(Event::Ended);
        })
        .is_err()
    {
        *state.0.lock().unwrap() = None;
        return Err("failed".into());
    }
    Ok(())
}

#[tauri::command]
pub fn speech_stop(
    window: tauri::WebviewWindow,
    state: tauri::State<Speech>,
    id: String,
    abort: bool,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("failed".into());
    }
    state.stop(&id, abort);
    Ok(())
}

fn run(root: PathBuf, lang: &str, control: &AtomicU8, sink: &Sink) -> Result<(), String> {
    if control.load(Ordering::Acquire) != 0 {
        return Ok(());
    }
    let assets = assets::resolve(&root, lang)?;
    sink(Event::Loading);
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("microphone")?;
    let supported = device.default_input_config().map_err(|_| "microphone")?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let mut engine = decoder::Decoder::new(
        &assets.library,
        &assets.model,
        config.sample_rate.0,
        assets.host.as_deref(),
    )?;
    if control.load(Ordering::Acquire) != 0 {
        return Ok(());
    }
    // Bound memory and latency even if the machine cannot decode as fast as capture.
    let (tx, rx) = mpsc::sync_channel(32);
    let overflow = Arc::new(AtomicBool::new(false));
    let audio_error = Arc::new(AtomicBool::new(false));
    let stream = match sample_format {
        cpal::SampleFormat::I8 => capture::<i8>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::I16 => capture::<i16>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::I32 => capture::<i32>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::U8 => capture::<u8>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::U16 => capture::<u16>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::U32 => capture::<u32>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::F32 => capture::<f32>(&device, &config, tx, &overflow, &audio_error),
        cpal::SampleFormat::F64 => capture::<f64>(&device, &config, tx, &overflow, &audio_error),
        _ => return Err("microphone".into()),
    }?;
    stream.play().map_err(|_| "microphone")?;
    sink(Event::Listening);
    let mut partial = String::new();
    loop {
        if control.load(Ordering::Acquire) != 0 {
            break;
        }
        if overflow.load(Ordering::Relaxed) {
            return Err("overloaded".into());
        }
        if audio_error.load(Ordering::Relaxed) {
            return Err("microphone".into());
        }
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(samples) => publish(&mut engine, &samples, &mut partial, sink)?,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => return Err("microphone".into()),
        }
    }
    drop(stream); // Release the microphone before draining the last captured phrase.
    if control.load(Ordering::Acquire) == 1 {
        for samples in rx.try_iter() {
            if control.load(Ordering::Acquire) == 2 {
                return Ok(());
            }
            publish(&mut engine, &samples, &mut partial, sink)?;
        }
        let text = engine.finish()?;
        if control.load(Ordering::Acquire) == 1 && !text.is_empty() {
            sink(Event::Final { text });
        }
    }
    Ok(()) // Engine + model are dropped here, not retained between sessions.
}
fn publish(
    engine: &mut decoder::Decoder,
    samples: &[i16],
    last: &mut String,
    sink: &Sink,
) -> Result<(), String> {
    let (complete, text) = engine.feed(samples)?;
    if complete {
        last.clear();
        if !text.is_empty() {
            sink(Event::Final { text });
        }
    } else if text != *last {
        *last = text.clone();
        sink(Event::Partial { text });
    }
    Ok(())
}
fn capture<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: SyncSender<Vec<i16>>,
    overflow: &Arc<AtomicBool>,
    audio_error: &Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + Sample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels);
    if channels == 0 {
        return Err("microphone".into());
    }
    let overflow = overflow.clone();
    let audio_error = audio_error.clone();
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let mono = downmix(data, channels);
                if tx.try_send(mono).is_err() {
                    overflow.store(true, Ordering::Relaxed);
                }
            },
            move |_| {
                audio_error.store(true, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|_| "microphone".into())
}
fn downmix<T: Sample>(samples: &[T], channels: usize) -> Vec<i16>
where
    f32: FromSample<T>,
{
    samples
        .chunks_exact(channels)
        .map(|frame| {
            let mono = frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / channels as f32;
            (mono.clamp(-1.0, 1.0) * 32768.0)
                .round()
                .clamp(-32768.0, 32767.0) as i16
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downmix_preserves_mono_and_combines_channels_without_overflow() {
        assert_eq!(downmix(&[0i16, 32767, -32768], 1), vec![0, 32767, -32768]);
        assert_eq!(downmix(&[1f32, -1., 0.5, 0.5], 2), vec![0, 16384]);
    }
    #[test]
    fn old_session_cannot_cancel_a_new_one() {
        let state = Speech(Mutex::new(Some(Session {
            id: "new".into(),
            control: Arc::new(AtomicU8::new(0)),
        })));
        state.stop("old", true);
        let control = state.0.lock().unwrap().as_ref().unwrap().control.clone();
        assert_eq!(control.load(Ordering::Acquire), 0);
        state.stop("new", false);
        assert_eq!(control.load(Ordering::Acquire), 1);
        state.stop("new", true);
        state.stop("new", false);
        assert_eq!(control.load(Ordering::Acquire), 2);
    }
    /// Opt-in full capture test, pointed explicitly at an isolated PulseAudio monitor.
    #[test]
    #[ignore]
    fn captures_virtual_microphone_and_flushes_on_stop() {
        let root = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_CACHE").unwrap());
        let sink_name = std::env::var("LIBRIA_TEST_VOSK_SINK").unwrap();
        let wav = std::env::var("LIBRIA_TEST_VOSK_WAV").unwrap();
        let control = Arc::new(AtomicU8::new(0));
        let worker_control = control.clone();
        let (tx, rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            run(root, "es-MX", &worker_control, &move |event| {
                let _ = tx.send(event);
            })
        });
        loop {
            let event = rx.recv_timeout(Duration::from_secs(20)).unwrap();
            if matches!(event, Event::Listening) {
                break;
            }
            println!("{event:?}");
        }
        let playback = std::process::Command::new("paplay")
            .args(["--device", &sink_name, &wav])
            .status()
            .unwrap();
        assert!(playback.success());
        std::thread::sleep(Duration::from_millis(300));
        control.store(1, Ordering::Release);
        worker.join().unwrap().unwrap();
        let words = rx
            .try_iter()
            .filter_map(|event| match event {
                Event::Final { text } => Some(text),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" ");
        println!("Captured: {words}");
        assert!(
            words.contains("libro") && words.contains("historia"),
            "{words}"
        );
    }

    // Opt-in real-library smoke test; never records a microphone or uses the network.
    #[test]
    #[ignore]
    fn transcribes_all_six_light_models_at_device_sample_rate() {
        let library = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_LIBRARY").unwrap());
        let models = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_MODELS").unwrap());
        let audio_dir = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_AUDIO").unwrap());
        for (locale, expected) in [
            ("en", "story"),
            ("fr", "histoire"),
            ("it", "storia"),
            ("de", "geschichte"),
            ("pt", "livro"),
            ("es", "libro"),
        ] {
            let model = assets::model_for_language(locale).unwrap();
            let audio = std::fs::read(audio_dir.join(format!("libria-vosk-{locale}.pcm"))).unwrap();
            let samples: Vec<i16> = audio
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]))
                .collect();
            let mut engine =
                engine::Engine::new(&library, &models.join(model.name), 48000).unwrap();
            let mut words = String::new();
            for chunk in samples.chunks(4800) {
                let (complete, text) = engine.feed(chunk).unwrap();
                if complete {
                    words.push_str(&text);
                    words.push(' ');
                }
            }
            words.push_str(&engine.finish().unwrap());
            println!("{locale}: {words}");
            assert!(words.contains(expected), "{locale}: {words}");
        }
    }

    // Real Vosk + Spanish PCM fixture. Explicit opt-in: normal tests never download or record audio.
    #[test]
    #[ignore]
    fn transcribes_spanish_pcm_offline() {
        let library = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_LIBRARY").unwrap());
        let model = PathBuf::from(std::env::var("LIBRIA_TEST_VOSK_MODEL").unwrap());
        let audio = std::fs::read(std::env::var("LIBRIA_TEST_VOSK_PCM").unwrap()).unwrap();
        let samples: Vec<i16> = audio
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        let mut engine = engine::Engine::new(&library, &model, 16000).unwrap();
        let mut words = String::new();
        for chunk in samples.chunks(4000) {
            let (complete, text) = engine.feed(chunk).unwrap();
            if complete {
                words.push_str(&text);
                words.push(' ');
            }
        }
        words.push_str(&engine.finish().unwrap());
        println!("Vosk: {words}");
        assert!(
            words.contains("historia") && words.contains("libro"),
            "{words}"
        );
    }
}
