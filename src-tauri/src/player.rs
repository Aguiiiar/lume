use crate::library::{self, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs::{File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Player {
    pub child: Option<Child>,
    pub writer: Option<File>,
    pub surface: isize,
    pub session: u64,
    pub current: Option<(PathBuf, Snapshot)>,
}
pub type Shared = Arc<Mutex<Player>>;
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: i64,
    pub position: f64,
    pub duration: f64,
    pub paused: bool,
    pub volume: f64,
    pub tracks: Value,
    pub aid: Value,
    pub sid: Value,
    pub ended: bool,
    pub error: Option<String>,
}
#[derive(Deserialize, Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub fn executable(db_path: &Path) -> Option<PathBuf> {
    let configured = library::db(db_path)
        .ok()
        .and_then(|c| library::setting(&c, "mpv"));
    if let Some(p) = configured {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let mut candidates = Vec::new();
    if let (Some(data), Ok(package)) = (db_path.parent(), crate::bootstrap::package()) {
        candidates.push(
            data.join("players")
                .join(format!("mpv-{}", package.version))
                .join("mpv.exe"),
        );
    }
    if let Ok(p) = std::env::current_exe() {
        if let Some(p) = p.parent() {
            candidates.push(p.join("tools/mpv/mpv.exe"));
            candidates.push(p.join("mpv.exe"));
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for p in std::env::split_paths(&path) {
            candidates.push(p.join("mpv.exe"));
        }
    }
    #[cfg(all(debug_assertions, not(feature = "smoke-test")))]
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tools/mpv/mpv.exe"));
    candidates.into_iter().find(|p| p.is_file())
}

// A child HWND is placed over the WebView's reserved video rectangle. Video frames
// stay inside mpv's native renderer; JavaScript only exchanges playback commands.
pub fn surface(app: &AppHandle, shared: Shared, rect: Rect) -> Result<isize> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let window = app
            .get_webview_window("main")
            .ok_or("Janela indisponível")?;
        let parent = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let result = (|| {
                let mut player = shared.lock().map_err(|e| e.to_string())?;
                unsafe {
                    if player.surface == 0 {
                        let class: Vec<u16> = "Static\0".encode_utf16().collect();
                        let hwnd = CreateWindowExW(
                            WS_EX_NOACTIVATE,
                            class.as_ptr(),
                            std::ptr::null(),
                            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                            0,
                            0,
                            1,
                            1,
                            parent as _,
                            std::ptr::null_mut(),
                            std::ptr::null_mut(),
                            std::ptr::null(),
                        );
                        if hwnd.is_null() {
                            return Err("Não foi possível criar a superfície de vídeo.".into());
                        }
                        player.surface = hwnd as isize;
                    }
                    SetWindowPos(
                        player.surface as _,
                        HWND_TOP,
                        (rect.x as f64 * scale) as i32,
                        (rect.y as f64 * scale) as i32,
                        (rect.width as f64 * scale).max(1.0) as i32,
                        (rect.height as f64 * scale).max(1.0) as i32,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
                Ok(player.surface)
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, shared, rect);
        Err("Esta primeira versão do player é para Windows.".into())
    }
}
pub fn hide_surface(app: &AppHandle, shared: Shared) {
    #[cfg(windows)]
    {
        let _ = app.run_on_main_thread(move || {
            if let Ok(p) = shared.lock() {
                if p.surface != 0 {
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(p.surface as _, 0);
                    }
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = (app, shared);
}
pub fn send(shared: &Shared, command: Value) -> Result<()> {
    let mut p = shared.lock().map_err(|e| e.to_string())?;
    let writer = p
        .writer
        .as_mut()
        .ok_or("O player ainda não está conectado.")?;
    let mut line = json!({"command":command,"request_id":1001}).to_string();
    line.push('\n');
    writer
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    // This connection has no observer reader. Drain command responses here, on the
    // same thread, so paused playback never deadlocks on a synchronous pipe handle.
    loop {
        let mut bytes = Vec::new();
        let mut byte = [0u8; 1];
        loop {
            writer.read_exact(&mut byte).map_err(|e| e.to_string())?;
            if byte[0] == b'\n' {
                break;
            }
            bytes.push(byte[0]);
            if bytes.len() > 1024 * 1024 {
                return Err("Resposta do player excedeu o limite.".into());
            }
        }
        if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
            if v["request_id"] == 1001 {
                return if v["error"] == "success" {
                    Ok(())
                } else {
                    Err(format!("O player não executou o comando: {}", v["error"]))
                };
            }
        }
    }
}
pub fn stop(shared: &Shared) {
    if let Ok(mut p) = shared.lock() {
        p.session += 1;
        if let Some((db, snapshot)) = p.current.take() {
            let _ = library::progress(&db, snapshot.id, snapshot.position, snapshot.duration);
        }
        if let Some(mut w) = p.writer.take() {
            let _ = w.write_all(b"{\"command\":[\"quit\"]}\n");
        }
        // Reap off the UI thread. Killing is a fallback after mpv has time to flush IPC.
        if let Some(mut child) = p.child.take() {
            std::thread::spawn(move || {
                for _ in 0..30 {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                let _ = child.kill();
                let _ = child.wait();
            });
        }
    }
}
pub fn start(
    app: AppHandle,
    shared: Shared,
    db_path: PathBuf,
    id: i64,
    rect: Rect,
    restart: bool,
) -> Result<()> {
    let file = library::path_for(&db_path, id)?;
    if !file.is_file() {
        return Err(
            "Arquivo indisponível. Verifique a pasta ou conecte o disco da biblioteca.".into(),
        );
    }
    let mpv = executable(&db_path)
        .ok_or("O mpv não foi encontrado. Selecione mpv.exe em Configurações.")?;
    stop(&shared);
    let handle = surface(&app, shared.clone(), rect)?;
    let session = {
        let mut p = shared.lock().map_err(|e| e.to_string())?;
        p.session += 1;
        p.session
    };
    let pipe = format!(r"\\.\pipe\lume-{}-{}", std::process::id(), session);
    let c = library::db(&db_path)?;
    let position = if restart {
        0.0
    } else {
        c.query_row("SELECT position FROM media WHERE id=?1", [id], |r| {
            r.get::<_, f64>(0)
        })
        .unwrap_or(0.0)
    };
    if restart {
        library::progress(&db_path, id, 0.0, 0.0)?;
    }
    let mut command = Command::new(mpv);
    command
        .args([
            "--no-config",
            "--idle=no",
            "--keep-open=yes",
            "--force-window=yes",
            "--hwdec=auto-safe",
            "--osc=no",
            "--input-default-bindings=no",
            "--input-vo-keyboard=no",
            "--cursor-autohide=3000",
            "--sub-auto=exact",
            "--sub-file-paths=subs:subtitles:legendas",
            "--alang=pt-BR,por,pt,jpn,eng",
            "--slang=pt-BR,por,pt,eng",
        ])
        .arg(format!("--wid={handle}"))
        .arg(format!("--input-ipc-server={pipe}"))
        .arg(format!("--start={position}"))
        .arg("--")
        .arg(&file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let child = command
        .spawn()
        .map_err(|e| format!("Não foi possível abrir o mpv: {e}"))?;
    shared.lock().map_err(|e| e.to_string())?.child = Some(child);
    let started = Instant::now();
    let mut connection = loop {
        match OpenOptions::new().read(true).write(true).open(&pipe) {
            Ok(f) => break f,
            Err(e) if started.elapsed() > Duration::from_secs(10) => {
                stop(&shared);
                hide_surface(&app, shared.clone());
                return Err(format!("O mpv não respondeu à conexão: {e}"));
            }
            _ => std::thread::sleep(Duration::from_millis(80)),
        }
        let mut state = shared.lock().map_err(|e| e.to_string())?;
        if state
            .child
            .as_mut()
            .and_then(|c| c.try_wait().ok().flatten())
            .is_some()
        {
            drop(state);
            hide_surface(&app, shared.clone());
            return Err("O mpv encerrou antes de iniciar o vídeo.".into());
        }
    };
    // Open a second pipe instance: cloning a synchronous Windows pipe shares its
    // file object, which can serialize a blocked read with an unrelated write.
    let connecting = Instant::now();
    let writer = loop {
        match OpenOptions::new().read(true).write(true).open(&pipe) {
            Ok(f) => break f,
            Err(e) if connecting.elapsed() > Duration::from_secs(5) => {
                return Err(format!(
                    "Não foi possível conectar o controle do player: {e}"
                ))
            }
            _ => std::thread::sleep(Duration::from_millis(30)),
        }
    };
    for (i, name) in [
        "time-pos",
        "duration",
        "pause",
        "volume",
        "track-list",
        "aid",
        "sid",
        "eof-reached",
    ]
    .iter()
    .enumerate()
    {
        let line = json!({"command":["observe_property",i,name]}).to_string() + "\n";
        connection
            .write_all(line.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    shared.lock().map_err(|e| e.to_string())?.writer = Some(writer);
    shared.lock().map_err(|e| e.to_string())?.current = Some((
        db_path.clone(),
        Snapshot {
            id,
            position,
            volume: 100.0,
            tracks: json!([]),
            ..Default::default()
        },
    ));
    std::thread::spawn(move || {
        let mut snap = Snapshot {
            id,
            position,
            volume: 100.0,
            tracks: json!([]),
            ..Default::default()
        };
        let mut saved = Instant::now();
        let mut normal_exit = false;
        for line in BufReader::new(connection).lines() {
            let Ok(line) = line else { break };
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if v["event"] == "property-change" {
                let d = &v["data"];
                match v["name"].as_str().unwrap_or("") {
                    "time-pos" => {
                        if let Some(n) = d.as_f64() {
                            snap.position = n;
                        }
                    }
                    "duration" => {
                        if let Some(n) = d.as_f64() {
                            snap.duration = n;
                        }
                    }
                    "pause" => snap.paused = d.as_bool().unwrap_or(false),
                    "volume" => snap.volume = d.as_f64().unwrap_or(100.0),
                    "track-list" => snap.tracks = d.clone(),
                    "aid" => snap.aid = d.clone(),
                    "sid" => snap.sid = d.clone(),
                    "eof-reached" => {
                        snap.ended = d.as_bool().unwrap_or(false);
                    }
                    _ => (),
                }
                let Ok(mut p) = shared.lock() else { break };
                if p.session != session {
                    return;
                }
                p.current = Some((db_path.clone(), snap.clone()));
                if snap.ended {
                    let _ = library::mark(&db_path, id, true);
                }
                if saved.elapsed() > Duration::from_secs(5) || snap.paused || snap.ended {
                    let _ = library::progress(&db_path, id, snap.position, snap.duration);
                    saved = Instant::now();
                }
                drop(p);
                let _ = app.emit("player-state", &snap);
            }
            if v["event"] == "end-file" {
                if v["reason"] == "error" {
                    snap.error = Some(format!(
                        "Não foi possível reproduzir o arquivo: {}",
                        v["file_error"].as_str().unwrap_or("erro de decodificação")
                    ));
                    let _ = app.emit("player-state", &snap);
                }
            }
            if v["event"] == "shutdown" {
                normal_exit = true;
                break;
            }
        }
        if let Ok(p) = shared.lock() {
            if p.session == session {
                let _ = library::progress(&db_path, id, snap.position, snap.duration);
            }
        }
        if !normal_exit && !snap.ended {
            let active = shared
                .lock()
                .map(|p| p.session == session && p.writer.is_some())
                .unwrap_or(false);
            if active {
                snap.error =
                    Some("A conexão com o player foi encerrada. Seu progresso foi salvo.".into());
                let _ = app.emit("player-state", &snap);
            }
        }
    });
    Ok(())
}
pub fn control(shared: &Shared, action: &str, value: Value) -> Result<()> {
    match action {
        "pause" => send(shared, json!(["cycle", "pause"])),
        "seek" => send(
            shared,
            json!([
                "seek",
                value.as_f64().ok_or("Posição inválida")?.max(0.0),
                "absolute+exact"
            ]),
        ),
        "volume" => send(
            shared,
            json!([
                "set_property",
                "volume",
                value.as_f64().ok_or("Volume inválido")?.clamp(0.0, 100.0)
            ]),
        ),
        "audio" | "subtitle" => {
            let v = if value == "no" {
                json!("no")
            } else {
                json!(value.as_i64().ok_or("Trilha inválida")?)
            };
            send(
                shared,
                json!([
                    "set_property",
                    if action == "audio" { "aid" } else { "sid" },
                    v
                ]),
            )
        }
        "sub-add" => {
            let s = value.as_str().ok_or("Legenda inválida")?;
            let p = Path::new(s);
            if !p.is_file()
                || !["srt", "ass", "ssa", "vtt", "sub", "idx", "sup"].contains(
                    &p.extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase()
                        .as_str(),
                )
            {
                return Err("Escolha um arquivo de legenda válido.".into());
            }
            send(shared, json!(["sub-add", s, "select"]))
        }
        _ => Err("Comando desconhecido".into()),
    }
}
