mod bootstrap;
mod library;
mod player;
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::{Emitter, Manager, State};
struct AppState {
    db: PathBuf,
    player: player::Shared,
    portable: bool,
    download_busy: Arc<AtomicBool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    portable: bool,
    onboarding_complete: bool,
    mpv: Option<String>,
    folders: Vec<String>,
    files: usize,
    version: String,
}
#[tauri::command]
fn app_status(state: State<'_, AppState>) -> library::Result<RuntimeInfo> {
    let library = library::load(&state.db)?;
    let mpv = player::executable(&state.db).map(|p| p.to_string_lossy().to_string());
    let complete = library::db(&state.db)
        .ok()
        .and_then(|c| library::setting(&c, "onboarding_complete"))
        .as_deref()
        == Some("true")
        || (!library.folders.is_empty() && mpv.is_some());
    Ok(RuntimeInfo {
        portable: state.portable,
        onboarding_complete: complete,
        mpv,
        folders: library.folders,
        files: library.media.len(),
        version: env!("CARGO_PKG_VERSION").into(),
    })
}
#[tauri::command]
fn onboarding_finish(state: State<'_, AppState>) -> library::Result<()> {
    library::save_setting(&state.db, "onboarding_complete", "true")
}
#[tauri::command]
async fn player_install(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> library::Result<String> {
    let db = state.db.clone();
    let busy = state.download_busy.clone();
    tauri::async_runtime::spawn_blocking(move || {
        bootstrap::install(&db, &busy, |progress| {
            let _ = app.emit("player-download", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn library_load(state: State<'_, AppState>) -> library::Result<library::Library> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || library::load(&db))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn folder_scan(
    state: State<'_, AppState>,
    path: String,
) -> library::Result<library::ScanReport> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || library::scan(&db, &path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn media_edit(state: State<'_, AppState>, items: Vec<library::Edit>) -> library::Result<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || library::edit(&db, items))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn media_mark(state: State<'_, AppState>, id: i64, watched: bool) -> library::Result<()> {
    library::mark(&state.db, id, watched)
}
#[tauri::command]
fn folder_remove(state: State<'_, AppState>, path: String) -> library::Result<()> {
    let mut c = library::db(&state.db)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM media WHERE root=?1", [&path])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM folders WHERE path=?1", [path])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn mpv_status(state: State<'_, AppState>) -> Option<String> {
    player::executable(&state.db).map(|p| p.to_string_lossy().to_string())
}
#[tauri::command]
fn mpv_configure(state: State<'_, AppState>, path: String) -> library::Result<()> {
    if !std::path::Path::new(&path).is_file() {
        return Err("Executável não encontrado.".into());
    }
    library::save_setting(&state.db, "mpv", &path)
}
#[tauri::command]
async fn player_start(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    rect: player::Rect,
    restart: bool,
) -> library::Result<()> {
    let db = state.db.clone();
    let p = state.player.clone();
    tauri::async_runtime::spawn_blocking(move || player::start(app, p, db, id, rect, restart))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn player_rect(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    rect: player::Rect,
) -> library::Result<()> {
    let p = state.player.clone();
    tauri::async_runtime::spawn_blocking(move || player::surface(&app, p, rect).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn player_control(
    state: State<'_, AppState>,
    action: String,
    value: serde_json::Value,
) -> library::Result<()> {
    let p = state.player.clone();
    tauri::async_runtime::spawn_blocking(move || player::control(&p, &action, value))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn player_stop(app: tauri::AppHandle, state: State<'_, AppState>) {
    player::stop(&state.player);
    player::hide_surface(&app, state.player.clone());
}
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (dir, portable) =
                bootstrap::data_directory(app.path().app_data_dir()?, &std::env::current_exe()?)
                    .map_err(std::io::Error::other)?;
            #[cfg(feature = "smoke-test")]
            let dir = std::env::var_os("LUME_TEST_DATA")
                .map(PathBuf::from)
                .unwrap_or(dir);
            std::fs::create_dir_all(&dir)?;
            let db = dir.join("library.sqlite");
            library::db(&db).map_err(std::io::Error::other)?;
            #[cfg(feature = "smoke-test")]
            {
                app.get_webview_window("main")
                    .unwrap()
                    .set_title("Lume — teste isolado")?;
                if let Ok(root) = std::env::var("LUME_TEST_MEDIA") {
                    library::scan(&db, &root).map_err(std::io::Error::other)?;
                }
            }
            app.manage(AppState {
                db,
                player: Arc::new(Mutex::new(player::Player::default())),
                portable,
                download_busy: Arc::new(AtomicBool::new(false)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_load,
            app_status,
            onboarding_finish,
            player_install,
            folder_scan,
            media_edit,
            media_mark,
            folder_remove,
            mpv_status,
            mpv_configure,
            player_start,
            player_rect,
            player_control,
            player_stop
        ])
        .build(tauri::generate_context!())
        .expect("Não foi possível iniciar o Lume");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            player::stop(&app.state::<AppState>().player);
        }
    });
}
