use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

pub type Result<T> = std::result::Result<T, String>;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: i64,
    pub root: String,
    pub path: String,
    pub filename: String,
    pub title: String,
    pub kind: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub position: f64,
    pub duration: f64,
    pub watched: bool,
    pub updated: i64,
    pub missing: bool,
    pub review: bool,
    pub manual: bool,
}
#[derive(Serialize)]
pub struct Library {
    pub media: Vec<Media>,
    pub folders: Vec<String>,
    pub mpv: String,
}
#[derive(Serialize)]
pub struct ScanReport {
    pub found: usize,
    pub warnings: Vec<String>,
}
#[derive(Deserialize)]
pub struct Edit {
    pub id: i64,
    pub title: String,
    pub kind: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
}

pub fn db(path: &Path) -> Result<Connection> {
    let c = Connection::open(path).map_err(|e| e.to_string())?;
    c.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    c.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS folders(path TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS media_excluded(path TEXT PRIMARY KEY, root TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS media(
          id INTEGER PRIMARY KEY, root TEXT NOT NULL, path TEXT UNIQUE NOT NULL, filename TEXT NOT NULL,
          title TEXT NOT NULL, kind TEXT NOT NULL, season INTEGER, episode INTEGER,
          position REAL NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0, watched INTEGER NOT NULL DEFAULT 0,
          updated INTEGER NOT NULL DEFAULT 0, missing INTEGER NOT NULL DEFAULT 0, review INTEGER NOT NULL DEFAULT 0,
          manual INTEGER NOT NULL DEFAULT 0);").map_err(|e| e.to_string())?;
    Ok(c)
}
pub fn load(path: &Path) -> Result<Library> {
    let c = db(path)?;
    let mut q = c.prepare("SELECT id,root,path,filename,title,kind,season,episode,position,duration,watched,updated,missing,review,manual FROM media ORDER BY title COLLATE NOCASE,season,episode,filename").map_err(|e| e.to_string())?;
    let mut media = q
        .query_map([], |r| {
            Ok(Media {
                id: r.get(0)?,
                root: r.get(1)?,
                path: r.get(2)?,
                filename: r.get(3)?,
                title: r.get(4)?,
                kind: r.get(5)?,
                season: r.get(6)?,
                episode: r.get(7)?,
                position: r.get(8)?,
                duration: r.get(9)?,
                watched: r.get(10)?,
                updated: r.get(11)?,
                missing: r.get(12)?,
                review: r.get(13)?,
                manual: r.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for item in &mut media {
        let missing = !Path::new(&item.path).is_file();
        if item.missing != missing {
            c.execute(
                "UPDATE media SET missing=?1 WHERE id=?2",
                params![missing, item.id],
            )
            .map_err(|e| e.to_string())?;
            item.missing = missing;
        }
    }
    let mut q = c
        .prepare("SELECT path FROM folders ORDER BY path")
        .map_err(|e| e.to_string())?;
    let folders = q
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<std::result::Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    let mpv = setting(&c, "mpv").unwrap_or_default();
    Ok(Library {
        media,
        folders,
        mpv,
    })
}
pub fn setting(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
        r.get(0)
    })
    .ok()
}
pub fn save_setting(path: &Path, key: &str, value: &str) -> Result<()> {
    db(path)?.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(|e|e.to_string())?;
    Ok(())
}

pub fn player_volume(path: &Path) -> Result<f64> {
    Ok(setting(&db(path)?, "player_volume")
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(0.0, 100.0))
        .unwrap_or(100.0))
}
pub fn save_player_volume(path: &Path, volume: f64) -> Result<()> {
    if !volume.is_finite() {
        return Err("Volume inválido".into());
    }
    save_setting(path, "player_volume", &volume.clamp(0.0, 100.0).to_string())
}
fn clean(s: &str) -> String {
    let s = s.replace(['.', '_'], " ");
    s.trim_matches(|c: char| c.is_whitespace() || c == '-' || c == '[' || c == ']')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
fn season_folder(s: &str) -> Option<i64> {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^(?:season|temporada|temp|s)[ ._-]*(\d+)$").unwrap())
        .captures(s)
        .and_then(|c| c[1].parse().ok())
}
#[derive(Debug)]
pub struct Identification {
    pub title: String,
    pub kind: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub review: bool,
}
pub fn identify(path: &Path) -> Identification {
    static EP: OnceLock<Regex> = OnceLock::new();
    static ABS: OnceLock<Regex> = OnceLock::new();
    static TAGS: OnceLock<Regex> = OnceLock::new();
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let parent = path.parent().unwrap_or(Path::new(""));
    let parent_name = parent.file_name().unwrap_or_default().to_string_lossy();
    let anime = path.components().any(|p| {
        matches!(
            p.as_os_str().to_string_lossy().to_lowercase().as_str(),
            "anime" | "animes"
        )
    });
    let ep = EP.get_or_init(|| {
        Regex::new(
            r"(?i)(?:\b|[._ -])(?:s(\d{1,3})[ ._-]*e(\d{1,4})|(\d{1,3})x(\d{1,4}))(?:\b|[._ -])",
        )
        .unwrap()
    });
    let tags = TAGS.get_or_init(|| Regex::new(r"\[[^\]]*\]").unwrap());
    let base = tags.replace_all(&stem, "");
    if let Some(cap) = ep.captures(&base) {
        let season = cap
            .get(1)
            .or_else(|| cap.get(3))
            .and_then(|v| v.as_str().parse().ok());
        let episode = cap
            .get(2)
            .or_else(|| cap.get(4))
            .and_then(|v| v.as_str().parse().ok());
        let mut title = clean(&base[..cap.get(0).unwrap().start()]);
        if title.is_empty() {
            title = if season_folder(&parent_name).is_some() {
                clean(
                    &parent
                        .parent()
                        .and_then(Path::file_name)
                        .unwrap_or_default()
                        .to_string_lossy(),
                )
            } else {
                clean(&parent_name)
            };
        }
        return Identification {
            title,
            kind: if anime { "anime" } else { "series" }.into(),
            season,
            episode,
            review: false,
        };
    }
    let abs = ABS.get_or_init(|| {
        Regex::new(
            r"(?i)(?:^|\s-\s|[._ ])(?:ep(?:is[oó]dio)?[ ._-]*)?(\d{1,4})(?:v\d)?(?:$|\s|[._])",
        )
        .unwrap()
    });
    let folder_season = season_folder(&parent_name);
    if anime || folder_season.is_some() {
        let episode = abs.captures(base.trim()).and_then(|c| c[1].parse().ok());
        let title = if folder_season.is_some() {
            clean(
                &parent
                    .parent()
                    .and_then(Path::file_name)
                    .unwrap_or_default()
                    .to_string_lossy(),
            )
        } else {
            clean(&parent_name)
        };
        return Identification {
            title,
            kind: if anime { "anime" } else { "series" }.into(),
            season: folder_season,
            episode,
            review: episode.is_none(),
        };
    }
    // Unmarked files remain available, but need review: filenames alone cannot prove a movie.
    Identification {
        title: clean(&base),
        kind: "movie".into(),
        season: None,
        episode: None,
        review: true,
    }
}
pub fn scan(db_path: &Path, root: &str) -> Result<ScanReport> {
    let root_path = std::fs::canonicalize(root)
        .map_err(|e| format!("Não foi possível acessar a pasta: {e}"))?;
    if !root_path.is_dir() {
        return Err("Escolha uma pasta válida.".into());
    }
    let root = root_path.to_string_lossy().to_string();
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    for entry in WalkDir::new(&root_path).follow_links(false) {
        match entry {
            Ok(e) if e.file_type().is_file() => {
                let ext = e
                    .path()
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if [
                    "mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "m2ts", "wmv", "mpg", "mpeg",
                ]
                .contains(&ext.as_str())
                {
                    entries.push(e.into_path());
                }
            }
            Err(e) => warnings.push(e.to_string()),
            _ => (),
        }
    }
    let mut c = db(db_path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT OR IGNORE INTO folders(path) VALUES(?1)", [&root])
        .map_err(|e| e.to_string())?;
    if warnings.is_empty() {
        tx.execute("UPDATE media SET missing=1 WHERE root=?1", [&root])
            .map_err(|e| e.to_string())?;
    }
    for p in &entries {
        let excluded: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM media_excluded WHERE path=?1)",
                [p.to_string_lossy().as_ref()],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if excluded {
            continue;
        }
        let id = identify(p);
        tx.execute("INSERT INTO media(root,path,filename,title,kind,season,episode,review) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
          ON CONFLICT(path) DO UPDATE SET missing=0, title=CASE WHEN manual THEN title ELSE excluded.title END,
          kind=CASE WHEN manual THEN kind ELSE excluded.kind END, season=CASE WHEN manual THEN season ELSE excluded.season END,
          episode=CASE WHEN manual THEN episode ELSE excluded.episode END, review=CASE WHEN manual THEN 0 ELSE excluded.review END",
          params![root,p.to_string_lossy(),p.file_name().unwrap_or_default().to_string_lossy(),id.title,id.kind,id.season,id.episode,id.review]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ScanReport {
        found: entries.len(),
        warnings,
    })
}
pub fn edit(db_path: &Path, items: Vec<Edit>) -> Result<()> {
    let mut c = db(db_path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for e in items {
        if e.title.trim().is_empty()
            || !["movie", "series", "anime"].contains(&e.kind.as_str())
            || e.season.is_some_and(|v| v < 0)
            || e.episode.is_some_and(|v| v < 0)
        {
            return Err("Informe um título, tipo e números válidos.".into());
        }
        tx.execute(
            "UPDATE media SET title=?1,kind=?2,season=?3,episode=?4,manual=1,review=0 WHERE id=?5",
            params![
                e.title.trim(),
                e.kind,
                if e.kind == "movie" { None } else { e.season },
                if e.kind == "movie" { None } else { e.episode },
                e.id
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
pub fn progress(db_path: &Path, id: i64, position: f64, duration: f64) -> Result<()> {
    if !position.is_finite() || !duration.is_finite() {
        return Ok(());
    }
    db(db_path)?.execute("UPDATE media SET position=?1,duration=CASE WHEN ?2>0 THEN ?2 ELSE duration END,updated=?3 WHERE id=?4", params![position.max(0.0),duration,now(),id]).map_err(|e|e.to_string())?;
    Ok(())
}
pub fn mark(db_path: &Path, id: i64, watched: bool) -> Result<()> {
    db(db_path)?.execute("UPDATE media SET watched=?1,position=CASE WHEN ?1 THEN position ELSE 0 END,updated=?2 WHERE id=?3",params![watched,now(),id]).map_err(|e|e.to_string())?;
    Ok(())
}
pub fn path_for(db_path: &Path, id: i64) -> Result<PathBuf> {
    let c = db(db_path)?;
    let path = c
        .query_row("SELECT path FROM media WHERE id=?1", [id], |r| {
            r.get::<_, String>(0)
        })
        .map(PathBuf::from)
        .map_err(|e| e.to_string())?;
    let missing = !path.is_file();
    c.execute(
        "UPDATE media SET missing=?1 WHERE id=?2",
        params![missing, id],
    )
    .map_err(|e| e.to_string())?;
    if missing {
        return Err(format!("Arquivo não encontrado: {}. Ele pode ter sido movido, apagado ou o disco desconectado. Você pode remover este item do catálogo; seu histórico foi preservado.", path.display()));
    }
    Ok(path)
}

pub fn remove(db_path: &Path, ids: Vec<i64>) -> Result<()> {
    let mut c = db(db_path)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        tx.execute("INSERT OR IGNORE INTO media_excluded(path,root) SELECT path,root FROM media WHERE id=?1", [id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM media WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn restore_excluded(db_path: &Path, root: &str) -> Result<()> {
    let root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    db(db_path)?
        .execute(
            "DELETE FROM media_excluded WHERE root=?1",
            [root.to_string_lossy().as_ref()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn availability_preserves_history_and_recovers_without_rescan() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("Show");
        std::fs::create_dir(&folder).unwrap();
        let file = folder.join("Show.S01E01.mkv");
        std::fs::write(&file, b"test").unwrap();
        let dbfile = temp.path().join("library.db");
        scan(&dbfile, folder.to_str().unwrap()).unwrap();
        let id = load(&dbfile).unwrap().media[0].id;
        progress(&dbfile, id, 2100.0, 3000.0).unwrap();
        std::fs::remove_file(&file).unwrap();
        assert!(path_for(&dbfile, id)
            .unwrap_err()
            .contains("Arquivo não encontrado"));
        let item = load(&dbfile).unwrap().media.remove(0);
        assert!(item.missing);
        assert_eq!(item.position, 2100.0);
        std::fs::write(&file, b"test").unwrap();
        assert!(!load(&dbfile).unwrap().media[0].missing);
        std::fs::remove_dir_all(&folder).unwrap();
        assert!(scan(&dbfile, folder.to_str().unwrap()).is_err());
        assert!(load(&dbfile).unwrap().media[0].missing);
    }
    #[test]
    fn catalog_removal_keeps_files_and_stays_removed_until_readding() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("Show.S01E01.mkv");
        std::fs::write(&file, b"video").unwrap();
        let dbfile = temp.path().join("library.db");
        let root = temp.path().to_str().unwrap();
        scan(&dbfile, root).unwrap();
        let id = load(&dbfile).unwrap().media[0].id;
        progress(&dbfile, id, 2100.0, 3000.0).unwrap();
        remove(&dbfile, vec![id]).unwrap();
        assert!(file.is_file());
        scan(&dbfile, root).unwrap();
        assert!(load(&dbfile).unwrap().media.is_empty());
        restore_excluded(&dbfile, root).unwrap();
        scan(&dbfile, root).unwrap();
        assert_eq!(load(&dbfile).unwrap().media[0].position, 0.0);
    }
    #[test]
    fn standard_episodes() {
        let hannibal = identify(Path::new(
            "Hannibal.S01E08.720p.WEB-DL.x264.DUAL-WWW.BLUDV.COM.mkv",
        ));
        assert_eq!(
            (
                hannibal.title.as_str(),
                hannibal.kind.as_str(),
                hannibal.season,
                hannibal.episode
            ),
            ("Hannibal", "series", Some(1), Some(8))
        );
        let x = identify(Path::new("Séries/Dark/Temporada 01/Dark.S01E03.1080p.mkv"));
        assert_eq!(
            (x.title.as_str(), x.season, x.episode, x.review),
            ("Dark", Some(1), Some(3), false)
        );
        let x = identify(Path::new("Série/Outra - 2x07.mkv"));
        assert_eq!(x.episode, Some(7));
    }
    #[test]
    fn anime_absolute_and_specials() {
        let x = identify(Path::new("Animes/Naruto/[Grupo] Naruto - 127 [1080p].mkv"));
        assert_eq!(
            (x.title.as_str(), x.season, x.episode),
            ("Naruto", None, Some(127))
        );
        let x = identify(Path::new("Séries/Show/Season 00/S00E01.mkv"));
        assert_eq!(x.season, Some(0));
        assert_eq!(x.title, "Show");
    }
    #[test]
    fn ambiguous_file_needs_review() {
        assert!(identify(Path::new("Videos/Arquivo estranho.mkv")).review);
    }
    #[test]
    fn volume_persists_between_sessions_including_silence() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("library.sqlite");
        assert_eq!(player_volume(&path).unwrap(), 100.0);
        save_player_volume(&path, 37.0).unwrap();
        assert_eq!(player_volume(&path).unwrap(), 37.0);
        save_player_volume(&path, 0.0).unwrap();
        assert_eq!(player_volume(&path).unwrap(), 0.0);
        save_player_volume(&path, 300.0).unwrap();
        assert_eq!(player_volume(&path).unwrap(), 100.0);
        assert!(save_player_volume(&path, f64::NAN).is_err());
        save_setting(&path, "player_volume", "NaN").unwrap();
        assert_eq!(player_volume(&path).unwrap(), 100.0);
        save_setting(&path, "player_volume", "invalid").unwrap();
        assert_eq!(player_volume(&path).unwrap(), 100.0);
    }
    #[test]
    fn rescans_preserve_history_and_corrections() {
        let temp = std::env::temp_dir().join(format!("lume-test-{}-{}", std::process::id(), now()));
        std::fs::create_dir_all(&temp).unwrap();
        let file = temp.join("Show.S01E03.mkv");
        std::fs::write(&file, b"test").unwrap();
        let dbfile = temp.join("test.db");
        scan(&dbfile, temp.to_str().unwrap()).unwrap();
        let item = load(&dbfile).unwrap().media.remove(0);
        progress(&dbfile, item.id, 2100.0, 3000.0).unwrap();
        edit(
            &dbfile,
            vec![Edit {
                id: item.id,
                title: "Minha série".into(),
                kind: "series".into(),
                season: Some(2),
                episode: Some(4),
            }],
        )
        .unwrap();
        scan(&dbfile, temp.to_str().unwrap()).unwrap();
        let item = load(&dbfile).unwrap().media.remove(0);
        assert_eq!(item.position, 2100.0);
        assert_eq!(item.title, "Minha série");
        assert_eq!(item.season, Some(2));
        std::fs::remove_file(file).unwrap();
        scan(&dbfile, temp.to_str().unwrap()).unwrap();
        assert!(load(&dbfile).unwrap().media[0].missing);
        std::fs::remove_dir_all(temp).unwrap();
    }
}
