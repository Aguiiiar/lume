use crate::{library::Result, maintenance, player};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
pub struct Progress {
    pub stage: &'static str,
    pub received: u64,
    pub total: Option<u64>,
}
struct Busy(Arc<AtomicBool>);
impl Drop for Busy {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn allowed(portable: bool, executable: &Path) -> Result<()> {
    if portable {
        return Err("A edição portátil usa atualização manual. Abra a página da release para baixar o novo ZIP.".into());
    }
    if maintenance::uninstaller(executable, false).is_none() {
        return Err(
            "Atualização pelo aplicativo disponível apenas na edição instalada pelo setup.".into(),
        );
    }
    Ok(())
}
pub fn manifest_url(version: &str) -> Result<String> {
    let v = semver::Version::parse(version).map_err(|_| "Versão de atualização inválida.")?;
    Ok(format!(
        "https://github.com/Aguiiiar/lume/releases/download/v{v}/latest.json"
    ))
}
pub fn validate_package(update: &tauri_plugin_updater::Update, requested: &str) -> Result<()> {
    if update.version != requested {
        return Err("A versão do pacote não corresponde à versão selecionada.".into());
    }
    let expected = format!("https://github.com/Aguiiiar/lume/releases/download/v{requested}/Lume-{requested}-windows-x64-setup.exe");
    if update.download_url.as_str() != expected {
        return Err("O pacote de atualização não pertence à release selecionada do Lume.".into());
    }
    Ok(())
}

pub async fn install(
    app: AppHandle,
    player: player::Shared,
    portable: bool,
    busy: Arc<AtomicBool>,
    version: String,
    previews: bool,
) -> Result<()> {
    allowed(
        portable,
        &std::env::current_exe().map_err(|e| e.to_string())?,
    )?;
    if busy.swap(true, Ordering::SeqCst) {
        return Err("Já existe uma atualização em andamento.".into());
    }
    let _busy = Busy(busy);
    let selected = tauri::async_runtime::spawn_blocking(move || maintenance::check(previews))
        .await
        .map_err(|e| e.to_string())??;
    if !selected.available || selected.latest.as_deref() != Some(version.as_str()) {
        return Err("A lista de versões mudou. Busque as atualizações novamente.".into());
    }
    let before_exit = player.clone();
    let updater = app
        .updater_builder()
        .endpoints(vec![manifest_url(&version)?
            .parse()
            .map_err(|e| format!("URL inválida: {e}"))?])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(300))
        .on_before_exit(move || player::stop(&before_exit))
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Não foi possível preparar a atualização: {e}"))?
        .ok_or("Nenhuma versão mais recente disponível.")?;
    validate_package(&update, &version)?;
    let _ = app.emit(
        "update-progress",
        Progress {
            stage: "download",
            received: 0,
            total: None,
        },
    );
    let mut received = 0;
    let mut last = Instant::now();
    let bytes = update.download(|size,total| {
        received += size as u64;
        if last.elapsed() >= Duration::from_millis(100) {
            let _ = app.emit("update-progress", Progress {stage:"download",received,total});
            last = Instant::now();
        }
    }, || { let _ = app.emit("update-progress", Progress {stage:"verify",received:0,total:None}); }).await.map_err(|e|format!("A atualização não foi instalada. Falha no download ou na verificação da assinatura: {e}"))?;
    let _ = app.emit(
        "update-progress",
        Progress {
            stage: "install",
            received: bytes.len() as u64,
            total: Some(bytes.len() as u64),
        },
    );
    tauri::async_runtime::spawn_blocking(move || {
        update
            .install(bytes)
            .map_err(|e| format!("Não foi possível iniciar o instalador: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_is_blocked_even_with_adjacent_uninstaller() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("lume.exe");
        std::fs::write(dir.path().join("uninstall.exe"), b"fixture").unwrap();
        assert!(allowed(true, &exe).is_err());
        assert!(allowed(false, &exe).is_ok());
        assert!(allowed(false, Path::new("uninstalled/lume.exe")).is_err());
    }
    #[test]
    fn endpoint_is_always_the_selected_public_release() {
        assert_eq!(
            manifest_url("0.1.4").unwrap(),
            "https://github.com/Aguiiiar/lume/releases/download/v0.1.4/latest.json"
        );
        assert!(manifest_url("../../evil").is_err());
    }
}
