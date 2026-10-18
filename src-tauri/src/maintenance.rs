use crate::library::Result;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Deserialize)]
pub struct Release {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub current: String,
    pub latest: Option<String>,
    pub available: bool,
    pub prerelease: bool,
}
pub fn choose_release(current: &str, releases: Vec<Release>, previews: bool) -> Result<Update> {
    let version = Version::parse(current).map_err(|e| e.to_string())?;
    let latest = releases
        .into_iter()
        .filter(|r| !r.draft && (previews || !r.prerelease))
        .filter_map(|r| {
            Version::parse(r.tag_name.strip_prefix('v').unwrap_or(&r.tag_name))
                .ok()
                .map(|v| (v, r.prerelease))
        })
        .filter(|(v, _)| previews || v.pre.is_empty())
        .max_by(|a, b| a.0.cmp(&b.0));
    Ok(Update {
        current: current.into(),
        latest: latest.as_ref().map(|r| r.0.to_string()),
        available: latest.as_ref().is_some_and(|r| r.0 > version),
        prerelease: latest.is_some_and(|r| r.1),
    })
}
pub fn check(previews: bool) -> Result<Update> {
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Lume/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let response=client.get("https://api.github.com/repos/Aguiiiar/lume/releases?per_page=100").header("Accept","application/vnd.github+json").send().and_then(|r|r.error_for_status()).map_err(|e|format!("Não foi possível consultar as releases. Verifique sua conexão e tente novamente. {e}"))?;
    let releases: Vec<Release> = serde_json::from_str(&response.text().map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    choose_release(env!("CARGO_PKG_VERSION"), releases, previews)
}
pub fn uninstaller(executable: &Path, portable: bool) -> Option<PathBuf> {
    if portable {
        return None;
    }
    executable
        .parent()
        .map(|p| p.join("uninstall.exe"))
        .filter(|p| p.is_file())
}
pub fn release_url(version: &str) -> Result<String> {
    let v = Version::parse(version).map_err(|_| "Versão de release inválida.")?;
    Ok(format!(
        "https://github.com/Aguiiiar/lume/releases/tag/v{v}"
    ))
}
pub fn open(target: &std::ffi::OsStr) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = target.encode_wide().chain(Some(0)).collect();
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        } as isize;
        if result <= 32 {
            return Err(format!(
                "O Windows não conseguiu abrir o assistente ou navegador (código {result})."
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("Recurso disponível no Windows.".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn r(tag: &str, preview: bool, draft: bool) -> Release {
        Release {
            tag_name: tag.into(),
            prerelease: preview,
            draft,
        }
    }
    #[test]
    fn compares_versions_numerically_and_respects_channel() {
        let x = choose_release(
            "0.1.1",
            vec![
                r("v0.1.9", false, false),
                r("v0.1.10", false, false),
                r("v0.2.0-beta.1", true, false),
            ],
            false,
        )
        .unwrap();
        assert_eq!(x.latest.as_deref(), Some("0.1.10"));
        assert!(x.available);
        let x = choose_release("0.1.1", vec![r("v0.2.0-beta.1", true, false)], true).unwrap();
        assert!(x.available);
        assert!(x.prerelease);
    }
    #[test]
    fn ignores_drafts_and_bad_tags() {
        let x = choose_release(
            "0.1.1",
            vec![
                r("v99.0.0", false, true),
                r("not-a-version", false, false),
                r("v0.1.0", false, false),
            ],
            true,
        )
        .unwrap();
        assert!(!x.available);
        assert_eq!(x.latest.as_deref(), Some("0.1.0"));
        assert!(release_url("https://evil.example").is_err());
    }
    #[test]
    fn portable_never_runs_uninstaller() {
        let tmp = tempfile::tempdir().unwrap();
        let exe = tmp.path().join("Lume.exe");
        std::fs::write(tmp.path().join("uninstall.exe"), b"test").unwrap();
        assert!(uninstaller(&exe, true).is_none());
        assert!(uninstaller(&exe, false).is_some());
    }
    #[test]
    #[ignore = "Queries the public GitHub API; run explicitly with network access"]
    fn checks_public_releases() {
        let result = check(true).unwrap();
        assert_eq!(result.current, env!("CARGO_PKG_VERSION"));
        assert!(result.latest.is_some());
    }
}
