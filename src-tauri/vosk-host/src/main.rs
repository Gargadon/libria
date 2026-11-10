//! Isolated x64 Vosk host for Windows ARM64, using the OS x64 compatibility layer.
#[allow(dead_code)]
#[path = "../../src/speech/engine.rs"]
mod engine;
use std::{
    io::{Read, Write},
    path::PathBuf,
};
fn run() -> Result<(), String> {
    let mut args = std::env::args_os().skip(1);
    let library = PathBuf::from(args.next().ok_or("runtime")?);
    let model = PathBuf::from(args.next().ok_or("model")?);
    let rate = args
        .next()
        .and_then(|s| s.to_str().and_then(|s| s.parse().ok()))
        .ok_or("failed")?;
    let mut engine = engine::Engine::new(&library, &model, rate)?;
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    writeln!(output, "{{\"ready\":true}}").map_err(|_| "runtime")?;
    output.flush().map_err(|_| "runtime")?;
    loop {
        let mut header = [0u8; 4];
        if input.read(&mut header[..1]).map_err(|_| "runtime")? == 0 {
            break;
        }
        input.read_exact(&mut header[1..]).map_err(|_| "runtime")?;
        let count = u32::from_le_bytes(header) as usize;
        if count > 512_000 {
            return Err("failed".into());
        }
        let (complete, text) = if count == 0 {
            (true, engine.finish()?)
        } else {
            let mut bytes = vec![0u8; count * 2];
            input.read_exact(&mut bytes).map_err(|_| "runtime")?;
            let samples: Vec<i16> = bytes
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]))
                .collect();
            engine.feed(&samples)?
        };
        serde_json::to_writer(
            &mut output,
            &serde_json::json!({ "complete": complete, "text": text }),
        )
        .map_err(|_| "runtime")?;
        writeln!(output).map_err(|_| "runtime")?;
        output.flush().map_err(|_| "runtime")?;
    }
    Ok(())
}
fn main() {
    if let Err(code) = run() {
        println!("{}", serde_json::json!({ "error": code }));
        std::process::exit(1);
    }
}
