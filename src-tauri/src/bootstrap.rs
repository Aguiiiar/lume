use crate::library::{self, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Deserialize)]
pub struct PlayerPackage {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
    pub stage: String,
}
pub fn package() -> Result<PlayerPackage> {
    serde_json::from_str(include_str!("../mpv.lock.json")).map_err(|e| e.to_string())
}
pub fn data_directory(default: PathBuf, executable: &Path) -> Result<(PathBuf, bool)> {
    let parent = executable
        .parent()
        .ok_or("Pasta do aplicativo indisponível.")?;
    let portable = parent.join("portable.marker").is_file();
    let dir = if portable {
        parent.join("data")
    } else {
        default
    };
    fs::create_dir_all(&dir).map_err(|e|format!("Não foi possível salvar os dados. Extraia o Lume para uma pasta com permissão de escrita: {e}"))?;
    Ok((dir, portable))
}
pub fn verify_digest(actual: &str, expected: &str) -> Result<()> {
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err("O arquivo recebido não passou pela verificação de integridade. Tente novamente ou selecione um mpv.exe existente.".into())
    }
}
struct DownloadGuard<'a>(&'a AtomicBool);
impl Drop for DownloadGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
pub fn install(db: &Path, busy: &AtomicBool, notify: impl Fn(DownloadProgress)) -> Result<String> {
    if busy.swap(true, Ordering::SeqCst) {
        return Err("O player já está sendo preparado. Aguarde a conclusão.".into());
    }
    let _guard = DownloadGuard(busy);
    let pkg = package()?;
    let parent = db.parent().ok_or("Pasta de dados indisponível.")?;
    let players = parent.join("players");
    fs::create_dir_all(&players).map_err(|e| e.to_string())?;
    let destination = players.join(format!("mpv-{}", pkg.version));
    let executable = destination.join("mpv.exe");
    if executable.is_file() {
        library::save_setting(db, "mpv", &executable.to_string_lossy())?;
        return Ok(executable.to_string_lossy().to_string());
    }
    let stage = tempfile::Builder::new()
        .prefix("lume-player-")
        .tempdir_in(&players)
        .map_err(|e| e.to_string())?;
    let archive = stage.path().join("mpv.7z");
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(300))
        .user_agent(concat!("Lume/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response=client.get(&pkg.url).send().and_then(|r|r.error_for_status()).map_err(|e|format!("Não foi possível baixar o player. Verifique sua conexão ou selecione um mpv.exe existente. {e}"))?;
    if response.content_length().is_some_and(|n| n != pkg.size) {
        return Err("O pacote disponível tem um tamanho diferente do esperado. Nenhum arquivo foi instalado.".into());
    }
    let mut output = fs::File::create(&archive).map_err(|e| e.to_string())?;
    let mut digest = Sha256::new();
    let mut received = 0u64;
    let mut buffer = [0u8; 65536];
    let mut emitted = Instant::now();
    loop {
        let size = response.read(&mut buffer).map_err(|e| e.to_string())?;
        if size == 0 {
            break;
        }
        received += size as u64;
        if received > pkg.size {
            return Err("O download excedeu o tamanho esperado.".into());
        }
        digest.update(&buffer[..size]);
        output
            .write_all(&buffer[..size])
            .map_err(|e| e.to_string())?;
        if emitted.elapsed() > Duration::from_millis(120) {
            notify(DownloadProgress {
                received,
                total: pkg.size,
                stage: "download".into(),
            });
            emitted = Instant::now();
        }
    }
    drop(output);
    if received != pkg.size {
        return Err("O download ficou incompleto. Tente novamente.".into());
    }
    verify_digest(&format!("{:x}", digest.finalize()), &pkg.sha256)?;
    notify(DownloadProgress {
        received,
        total: pkg.size,
        stage: "extract".into(),
    });
    let extracted = stage.path().join("unpacked");
    sevenz_rust::decompress_file(&archive, &extracted)
        .map_err(|e| format!("Não foi possível preparar o player: {e}"))?;
    if !extracted.join("mpv.exe").is_file() {
        return Err("O pacote não contém o executável esperado.".into());
    }
    // Only verified upstream bytes are extracted. Promote the whole versioned
    // folder atomically; failures leave the existing player untouched.
    fs::rename(&extracted, &destination).map_err(|e| e.to_string())?;
    library::save_setting(db, "mpv", &executable.to_string_lossy())?;
    notify(DownloadProgress {
        received,
        total: pkg.size,
        stage: "done".into(),
    });
    Ok(executable.to_string_lossy().to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_changed_package() {
        assert!(verify_digest("abcd", "abce").is_err());
        assert!(verify_digest("ABCD", "abcd").is_ok());
    }
    #[test]
    fn portable_data_stays_beside_executable() {
        let root = tempfile::tempdir().unwrap();
        let normal = root.path().join("appdata");
        let exe = root.path().join("Lume.exe");
        let (data, portable) = data_directory(normal.clone(), &exe).unwrap();
        assert_eq!(data, normal);
        assert!(!portable);
        fs::write(root.path().join("portable.marker"), b"").unwrap();
        let (data, portable) = data_directory(normal, &exe).unwrap();
        assert_eq!(data, root.path().join("data"));
        assert!(portable);
    }
    #[test]
    fn download_is_fixed_and_uses_https() {
        let p = package().unwrap();
        assert!(p.url.starts_with("https://github.com/"));
        assert_eq!(p.sha256.len(), 64);
        assert!(p.size > 0);
    }
    #[test]
    #[ignore = "Downloads the pinned upstream package; run explicitly with network access"]
    fn real_player_download_and_relocation() {
        let root = tempfile::tempdir().unwrap();
        let data = root.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let db = data.join("library.sqlite");
        let busy = AtomicBool::new(false);
        let player = install(&db, &busy, |_| {}).unwrap();
        let mut file = fs::File::open(&player).unwrap();
        let mut magic = [0u8; 2];
        file.read_exact(&mut magic).unwrap();
        drop(file);
        assert_eq!(&magic, b"MZ");
        assert_eq!(
            install(&db, &busy, |_| panic!(
                "Already installed; must not download again"
            ))
            .unwrap(),
            player
        );
        let moved = root.path().join("moved-data");
        fs::rename(&data, &moved).unwrap();
        let resolved = crate::player::executable(&moved.join("library.sqlite")).unwrap();
        assert!(resolved.starts_with(&moved));
        assert!(resolved.is_file());
    }
}
