use crate::player::Shared;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct Keys {
    previous: [bool; 2],
}
impl Keys {
    fn sample(&mut self, down: [bool; 2], focused: bool) -> [bool; 2] {
        let pressed = [
            focused && down[0] && !self.previous[0],
            focused && down[1] && !self.previous[1],
        ];
        self.previous = down;
        pressed
    }
}

// Embedded mpv creates a disabled child HWND on Windows, so WebView pointer/key
// handlers cannot observe input over it. Sample only F11/Esc and pointer position,
// scoped to our foreground window. No hooks or global hotkeys are registered.
pub fn start(app: tauri::AppHandle, player: Shared) -> crate::library::Result<()> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::POINT,
            UI::{
                Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_F11},
                WindowsAndMessaging::{GetCursorPos, GetForegroundWindow, GetWindowRect, IsWindow},
            },
        };
        let parent = app
            .get_webview_window("main")
            .ok_or("Janela indisponível")?
            .hwnd()
            .map_err(|e| e.to_string())?
            .0 as isize;
        std::thread::spawn(move || {
            let mut keys = Keys::default();
            let mut pointer = None;
            loop {
                let focused;
                unsafe {
                    if IsWindow(parent as _) == 0 {
                        break;
                    }
                    focused = GetForegroundWindow() == parent as _;
                    let down = [
                        GetAsyncKeyState(VK_F11 as i32) < 0,
                        GetAsyncKeyState(VK_ESCAPE as i32) < 0,
                    ];
                    for (pressed, key) in keys
                        .sample(down, focused)
                        .into_iter()
                        .zip(["F11", "Escape"])
                    {
                        if pressed {
                            let _ = app.emit("window-shortcut", serde_json::json!({"key":key}));
                        }
                    }
                    let mut point = POINT { x: 0, y: 0 };
                    if GetCursorPos(&mut point) != 0 {
                        let next = Some((point.x, point.y));
                        if focused && next != pointer {
                            let mut bounds = std::mem::zeroed();
                            if GetWindowRect(parent as _, &mut bounds) != 0
                                && point.x >= bounds.left
                                && point.x < bounds.right
                                && point.y >= bounds.top
                                && point.y < bounds.bottom
                            {
                                let id = player
                                    .try_lock()
                                    .ok()
                                    .and_then(|p| p.current.as_ref().map(|(_, s)| s.id));
                                if let Some(id) = id {
                                    let _ =
                                        app.emit("player-activity", serde_json::json!({"id":id}));
                                }
                            }
                        }
                        pointer = next;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(if focused {
                    20
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
    #[test]
    fn shortcut_fires_once_per_press_and_only_with_app_focus() {
        let mut keys = Keys::default();
        assert_eq!(keys.sample([true, false], true), [true, false]);
        assert_eq!(keys.sample([true, false], true), [false, false]);
        assert_eq!(keys.sample([false, false], true), [false, false]);
        assert_eq!(keys.sample([true, false], true), [true, false]);
        assert_eq!(keys.sample([false, true], false), [false, false]);
        assert_eq!(keys.sample([false, true], true), [false, false]);
        keys.sample([false, false], true);
        assert_eq!(keys.sample([false, true], true), [false, true]);
    }
}
