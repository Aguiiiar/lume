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
    if !main.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok(());
    }
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
    if ENABLED.load(Ordering::SeqCst) && main.is_fullscreen().map_err(|e| e.to_string())? {
        overlay
            .set_position(main.inner_position().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        overlay
            .set_size(main.inner_size().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        overlay.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn sync(app: &AppHandle) {
    if !ENABLED.load(Ordering::SeqCst) {
        return;
    }
    if let (Some(main), Some(overlay)) = (
        app.get_webview_window("main"),
        app.get_webview_window(LABEL),
    ) {
        if main.is_fullscreen().unwrap_or(false) {
            if let Ok(position) = main.inner_position() {
                let _ = overlay.set_position(position);
            }
            if let Ok(size) = main.inner_size() {
                let _ = overlay.set_size(size);
            }
        } else {
            let _ = overlay.hide();
        }
    }
}

pub fn close(app: &AppHandle) {
    ENABLED.store(false, Ordering::SeqCst);
    if let Some(overlay) = app.get_webview_window(LABEL) {
        let _ = overlay.destroy();
    }
}
