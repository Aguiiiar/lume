use crate::library::Result;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "player-overlay";
static ENABLED: AtomicBool = AtomicBool::new(false);
static CREATE: Mutex<()> = Mutex::new(());

// An owned transparent window composites above mpv's child HWND. CSS alone in
// the main WebView cannot draw controls above that native video surface.
pub fn set(app: &AppHandle, enabled: bool) -> Result<()> {
    ENABLED.store(enabled, Ordering::SeqCst);
    if !enabled {
        if let Some(overlay) = app.get_webview_window(LABEL) {
            overlay.hide().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let _guard = CREATE.lock().map_err(|e| e.to_string())?;
    let main = app
        .get_webview_window("main")
        .ok_or("Janela indisponível")?;
    let overlay = if let Some(overlay) = app.get_webview_window(LABEL) {
        overlay
    } else {
        let builder = WebviewWindowBuilder::new(
            app,
            LABEL,
            WebviewUrl::App("index.html?player-overlay".into()),
        )
        .title("Lume — controles")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false);
        #[cfg(windows)]
        let builder = builder.owner(&main).map_err(|e| e.to_string())?;
        builder.build().map_err(|e| e.to_string())?
    };
    if ENABLED.load(Ordering::SeqCst) {
        place(app, &overlay)?;
        overlay.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn place(app: &AppHandle, overlay: &tauri::WebviewWindow) -> Result<()> {
    let main = app
        .get_webview_window("main")
        .ok_or("Janela indisponível")?;
    let origin = main.inner_position().map_err(|e| e.to_string())?;
    if main.is_fullscreen().map_err(|e| e.to_string())? {
        overlay.set_position(origin).map_err(|e| e.to_string())?;
        overlay
            .set_size(main.inner_size().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    } else {
        let rect = app
            .state::<crate::AppState>()
            .player
            .lock()
            .map_err(|e| e.to_string())?
            .rect
            .ok_or("Área do vídeo indisponível")?;
        let scale = main.scale_factor().map_err(|e| e.to_string())?;
        overlay
            .set_position(tauri::PhysicalPosition::new(
                origin.x + (rect.x as f64 * scale).round() as i32,
                origin.y + (rect.y as f64 * scale).round() as i32,
            ))
            .map_err(|e| e.to_string())?;
        overlay
            .set_size(tauri::PhysicalSize::new(
                (rect.width as f64 * scale).max(1.0).round() as u32,
                (rect.height as f64 * scale).max(1.0).round() as u32,
            ))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn sync(app: &AppHandle) {
    if ENABLED.load(Ordering::SeqCst) {
        if let Some(overlay) = app.get_webview_window(LABEL) {
            let _ = place(app, &overlay);
        }
    }
}

pub fn close(app: &AppHandle) {
    ENABLED.store(false, Ordering::SeqCst);
    if let Some(overlay) = app.get_webview_window(LABEL) {
        let _ = overlay.destroy();
    }
}
