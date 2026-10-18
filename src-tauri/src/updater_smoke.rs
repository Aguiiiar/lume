// Test-only executable, excluded from all public packages. Never installs locally:
// installation is permitted only inside RUNNER_TEMP on a disposable GitHub runner.
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tauri_plugin_updater::UpdaterExt;
fn main() {
    if let Err(error) = run() {
        eprintln!("Updater smoke failed: {error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let action = args.get(1).ok_or("Missing action")?;
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))?;
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    let mut plugin = config["plugins"]["updater"].clone();
    plugin["windows"]["installMode"] = serde_json::json!("quiet");
    context
        .config_mut()
        .plugins
        .0
        .insert("updater".into(), plugin);
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)?;
    let version = config["version"].as_str().ok_or("Version missing")?;
    let endpoint =
        format!("https://github.com/Aguiiiar/lume/releases/download/v{version}/latest.json");
    let mut builder = app
        .updater_builder()
        .endpoints(vec![endpoint.parse()?])?
        .timeout(Duration::from_secs(120))
        .version_comparator(|_, _| true)
        .restart_after_install(false);
    if action == "remote" {
        tauri::async_runtime::block_on(async {
            let update = builder.build()?.check().await?.ok_or("Manifest missing")?;
            update.download(|_, _| {}, || {}).await?;
            Ok::<(), Box<dyn std::error::Error>>(())
        })?;
        println!("Public manifest and package downloaded; signature verified.");
        return Ok(());
    }
    let dir = PathBuf::from(args.get(2).ok_or("Missing package directory")?);
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("latest.json"))?)?;
    let bytes = std::fs::read(dir.join(format!("Lume-{version}-windows-x64-setup.exe")))?;
    if action == "install" {
        if std::env::var("GITHUB_ACTIONS").as_deref() != Ok("true") {
            return Err("Installation smoke requires disposable CI runner".into());
        }
        let temp = PathBuf::from(std::env::var("RUNNER_TEMP")?).canonicalize()?;
        let installed = Path::new(args.get(3).ok_or("Missing installed exe")?).canonicalize()?;
        if !installed.starts_with(&temp) {
            return Err("Install target outside RUNNER_TEMP".into());
        }
        builder = builder.executable_path(&installed);
    } else if action != "verify" {
        return Err("Unknown action".into());
    }
    let updater = builder.build()?;
    let update = updater
        .restore_update(manifest.clone())?
        .ok_or("Manifest invalid")?;
    update.verify(&bytes)?;
    let mut changed = bytes.clone();
    changed[0] ^= 1;
    if update.verify(&changed).is_ok() {
        return Err("Tampered package accepted".into());
    }
    let mut inflated = manifest;
    inflated["version"] = serde_json::json!("999.0.0");
    let mismatch = updater
        .restore_update(inflated)?
        .ok_or("Forged manifest missing")?;
    if mismatch.verify(&bytes).is_ok() {
        return Err("Wrong signed version accepted".into());
    }
    println!("Signature valid; tampered bytes and mismatched signed version rejected.");
    if action == "install" {
        update.install(bytes)?;
    }
    Ok(())
}
