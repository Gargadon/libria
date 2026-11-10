use super::engine::Engine;
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

pub enum Decoder {
    Native(Engine),
    Host(Host),
}
impl Decoder {
    pub fn new(
        library: &Path,
        model: &Path,
        rate: u32,
        host: Option<&Path>,
    ) -> Result<Self, String> {
        if let Some(host) = host {
            Ok(Self::Host(Host::new(host, library, model, rate)?))
        } else {
            Ok(Self::Native(Engine::new(library, model, rate)?))
        }
    }
    pub fn feed(&mut self, samples: &[i16]) -> Result<(bool, String), String> {
        match self {
            Self::Native(engine) => engine.feed(samples),
            Self::Host(host) => host.request(samples),
        }
    }
    pub fn finish(&mut self) -> Result<String, String> {
        match self {
            Self::Native(engine) => engine.finish(),
            Self::Host(host) => host.request(&[]).map(|(_, text)| text),
        }
    }
}
pub struct Host {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}
impl Host {
    fn new(executable: &Path, library: &Path, model: &Path, rate: u32) -> Result<Self, String> {
        let mut command = Command::new(executable);
        command
            .arg(library)
            .arg(model)
            .arg(rate.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| "runtime")?;
        let input = child.stdin.take().ok_or("runtime")?;
        let output = BufReader::new(child.stdout.take().ok_or("runtime")?);
        let mut host = Self {
            child,
            input,
            output,
        };
        if host.read()?.get("ready").and_then(|v| v.as_bool()) != Some(true) {
            return Err("runtime".into());
        }
        Ok(host)
    }
    fn read(&mut self) -> Result<serde_json::Value, String> {
        let mut line = String::new();
        // Bound replies from the helper, including corrupt/invalid output.
        use std::io::Read;
        (&mut self.output)
            .take(1024 * 1024)
            .read_line(&mut line)
            .map_err(|_| "runtime")?;
        let reply: serde_json::Value = serde_json::from_str(&line).map_err(|_| "runtime")?;
        if let Some(error) = reply.get("error").and_then(|v| v.as_str()) {
            return Err(error.into());
        }
        Ok(reply)
    }
    fn request(&mut self, samples: &[i16]) -> Result<(bool, String), String> {
        let count = u32::try_from(samples.len()).map_err(|_| "failed")?;
        if count > 512_000 {
            return Err("failed".into());
        }
        let mut bytes = Vec::with_capacity(4 + samples.len() * 2);
        bytes.extend_from_slice(&count.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.input.write_all(&bytes).map_err(|_| "runtime")?;
        self.input.flush().map_err(|_| "runtime")?;
        let reply = self.read()?;
        Ok((
            reply
                .get("complete")
                .and_then(|v| v.as_bool())
                .ok_or("runtime")?,
            reply
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or("runtime")?
                .into(),
        ))
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore]
    fn isolated_host_transcribes_and_flushes_local_pcm() {
        let host = std::env::var_os("LIBRIA_TEST_VOSK_HOST").unwrap();
        let library = std::env::var_os("LIBRIA_TEST_VOSK_LIBRARY").unwrap();
        let model = std::env::var_os("LIBRIA_TEST_VOSK_MODEL").unwrap();
        let audio = std::fs::read(std::env::var_os("LIBRIA_TEST_VOSK_PCM").unwrap()).unwrap();
        let mut decoder = Decoder::new(
            Path::new(&library),
            Path::new(&model),
            16000,
            Some(Path::new(&host)),
        )
        .unwrap();
        let samples: Vec<i16> = audio
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        let mut words = String::new();
        for chunk in samples.chunks(4000) {
            let (complete, text) = decoder.feed(chunk).unwrap();
            if complete {
                words.push_str(&text);
                words.push(' ');
            }
        }
        words.push_str(&decoder.finish().unwrap());
        assert!(
            words.contains("libro") && words.contains("historia"),
            "{words}"
        );
    }
}
