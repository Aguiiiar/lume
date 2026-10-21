use crate::player::Shared;
use tauri::{Emitter, Manager};
const KEY_NAMES: [&str; 8] = [
    "F11",
    "Escape",
    "KeyS",
    "Space",
    "ArrowRight",
    "ArrowLeft",
    "ArrowUp",
    "ArrowDown",
];
#[derive(Default)]
struct Keys {
    previous: [bool; 8],
    repeat_at: [Option<u64>; 8],
}
impl Keys {
    fn sample(&mut self, down: [bool; 8], focused: bool, now: u64) -> [bool; 8] {
        let mut pressed = [false; 8];
        for i in 0..8 {
            if !focused || !down[i] {
                self.repeat_at[i] = None;
            } else if !self.previous[i] {
                pressed[i] = true;
                if i >= 4 {
                    self.repeat_at[i] = Some(now + 350);
                }
            } else if self.repeat_at[i].is_some_and(|due| now >= due) {
                pressed[i] = true;
                self.repeat_at[i] = Some(now + 100);
            }
        }
        self.previous = down;
        pressed
    }
}
#[derive(Clone, Copy)]
struct Click {
    id: i64,
    point: (i32, i32),
    due: u64,
}
#[derive(Default)]
struct Clicks {
    pending: Option<Click>,
}
impl Clicks {
    fn release(
        &mut self,
        now: u64,
        id: i64,
        point: (i32, i32),
        delay: u64,
        slop: (i32, i32),
    ) -> Option<(i64, &'static str)> {
        if self.pending.is_some_and(|p| {
            p.id == id
                && now < p.due
                && (point.0 - p.point.0).abs() <= slop.0
                && (point.1 - p.point.1).abs() <= slop.1
        }) {
            self.pending = None;
            Some((id, "double"))
        } else {
            let previous = self.pending.take();
            self.pending = Some(Click {
                id,
                point,
                due: now + delay,
            });
            previous.map(|p| (p.id, "single"))
        }
    }
    fn expire(&mut self, now: u64) -> Option<i64> {
        if self.pending.is_some_and(|p| now >= p.due) {
            self.pending.take().map(|p| p.id)
        } else {
            None
        }
    }
}
// The embedded video does not deliver input to WebView. Scope observation to
// foreground Lume and hit-test the video so controls and menus never toggle it.
pub fn start(app: tauri::AppHandle, player: Shared) -> crate::library::Result<()> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::POINT,
            UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
        };
        let parent = app
            .get_webview_window("main")
            .ok_or("Janela indisponível")?
            .hwnd()
            .map_err(|e| e.to_string())?
            .0 as isize;
        std::thread::spawn(move || {
            let mut keys = Keys::default();
            let mut clicks = Clicks::default();
            let mut pointer = None;
            let mut left_down = false;
            let mut drag: Option<(i64, (i32, i32))> = None;
            let mut active: Option<(i64, isize)> = None;
            let epoch = std::time::Instant::now();
            loop {
                let focused;
                let now = epoch.elapsed().as_millis() as u64;
                unsafe {
                    if IsWindow(parent as _) == 0 {
                        break;
                    }
                    // Include only the controls window, not owned file dialogs.
                    let foreground = GetForegroundWindow();
                    let overlay = app
                        .get_webview_window("player-overlay")
                        .and_then(|w| w.hwnd().ok())
                        .map(|h| h.0);
                    focused = foreground == parent as _ || overlay == Some(foreground);
                    let modified = [VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN]
                        .iter()
                        .any(|k| GetAsyncKeyState(*k as i32) < 0);
                    let codes = [
                        VK_F11, VK_ESCAPE, 0x53, VK_SPACE, VK_RIGHT, VK_LEFT, VK_UP, VK_DOWN,
                    ];
                    let down = codes.map(|k| GetAsyncKeyState(k as i32) < 0);
                    for (pressed, key) in keys
                        .sample(down, focused && !modified, now)
                        .into_iter()
                        .zip(KEY_NAMES)
                    {
                        if pressed {
                            let _ = app.emit("window-shortcut", serde_json::json!({"key":key}));
                        }
                    }
                    if let Ok(p) = player.try_lock() {
                        let next = p.current.as_ref().map(|(_, s)| (s.id, p.surface));
                        if next != active {
                            clicks.pending = None;
                            drag = None;
                        }
                        active = next;
                    }
                    if !focused {
                        clicks.pending = None;
                        drag = None;
                    }
                    if let Some(id) = clicks.expire(now) {
                        if focused && active.is_some_and(|a| a.0 == id) {
                            let _ = app.emit(
                                "player-pointer",
                                serde_json::json!({"id":id,"kind":"single"}),
                            );
                        }
                    }
                    let mut point = POINT { x: 0, y: 0 };
                    let mouse_down = GetAsyncKeyState(VK_LBUTTON as i32) < 0;
                    if GetCursorPos(&mut point) != 0 {
                        let xy = (point.x, point.y);
                        if focused && Some(xy) != pointer {
                            let mut bounds = std::mem::zeroed();
                            if GetWindowRect(parent as _, &mut bounds) != 0
                                && point.x >= bounds.left
                                && point.x < bounds.right
                                && point.y >= bounds.top
                                && point.y < bounds.bottom
                            {
                                if let Some((id, _)) = active {
                                    let _ =
                                        app.emit("player-activity", serde_json::json!({"id":id}));
                                }
                            }
                        }
                        pointer = Some(xy);
                        let over_video = active.is_some_and(|(_, surface)| {
                            let hit = WindowFromPoint(point);
                            surface != 0 && (hit == surface as _ || IsChild(surface as _, hit) != 0)
                        });
                        if focused && over_video && mouse_down && !left_down {
                            drag = active.map(|(id, _)| (id, xy));
                        }
                        if !mouse_down && left_down {
                            if let Some((id, start)) = drag.take() {
                                if focused
                                    && over_video
                                    && active.is_some_and(|a| a.0 == id)
                                    && (xy.0 - start.0).abs() <= GetSystemMetrics(SM_CXDRAG)
                                    && (xy.1 - start.1).abs() <= GetSystemMetrics(SM_CYDRAG)
                                {
                                    if let Some((id, kind)) = clicks.release(
                                        now,
                                        id,
                                        xy,
                                        GetDoubleClickTime() as u64,
                                        (
                                            GetSystemMetrics(SM_CXDOUBLECLK) / 2,
                                            GetSystemMetrics(SM_CYDOUBLECLK) / 2,
                                        ),
                                    ) {
                                        let _ = app.emit(
                                            "player-pointer",
                                            serde_json::json!({"id":id,"kind":kind}),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    left_down = mouse_down;
                }
                std::thread::sleep(std::time::Duration::from_millis(if focused {
                    10
                } else {
                    80
                }));
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (app, player);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn down(index: usize) -> [bool; 8] {
        let mut keys = [false; 8];
        keys[index] = true;
        keys
    }
    #[test]
    fn toggles_once_and_repeats_only_arrows() {
        let mut keys = Keys::default();
        assert!(keys.sample(down(0), true, 0)[0]);
        assert!(!keys.sample(down(0), true, 1000)[0]);
        assert!(!keys.sample(down(1), false, 1100)[1]);
        assert!(!keys.sample(down(1), true, 1200)[1]);
        keys.sample([false; 8], true, 1300);
        assert!(keys.sample(down(1), true, 1400)[1]);
        assert!(keys.sample(down(6), true, 1500)[6]);
        assert!(!keys.sample(down(6), true, 1800)[6]);
        assert!(keys.sample(down(6), true, 1850)[6]);
        assert!(!keys.sample(down(6), false, 1950)[6]);
        assert!(!keys.sample(down(6), true, 2100)[6]);
    }
    #[test]
    fn double_click_does_not_also_pause() {
        let mut clicks = Clicks::default();
        assert_eq!(clicks.release(0, 1, (100, 100), 500, (4, 4)), None);
        assert_eq!(clicks.expire(200), None);
        assert_eq!(
            clicks.release(250, 1, (102, 101), 500, (4, 4)),
            Some((1, "double"))
        );
        assert_eq!(clicks.expire(1000), None);
        assert_eq!(clicks.release(1100, 1, (100, 100), 500, (4, 4)), None);
        assert_eq!(clicks.expire(1600), Some(1));
        assert_eq!(clicks.expire(1700), None);
    }
    #[test]
    fn distant_clicks_and_different_media_are_not_double_clicks() {
        let mut clicks = Clicks::default();
        clicks.release(0, 1, (10, 10), 500, (4, 4));
        assert_eq!(
            clicks.release(100, 2, (10, 10), 500, (4, 4)),
            Some((1, "single"))
        );
        assert_eq!(
            clicks.release(200, 2, (100, 100), 500, (4, 4)),
            Some((2, "single"))
        );
        assert_eq!(clicks.expire(700), Some(2));
    }
}
