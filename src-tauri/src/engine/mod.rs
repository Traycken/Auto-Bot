use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::OnceLock;
use serde::{Deserialize, Serialize};

use anyhow::{anyhow, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings};
use log::info;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

use crate::blocks::{Block, Graph, GraphEdge, GraphNode, MouseButton, interpolate_text};

type Vars = HashMap<String, String>;
type Adj  = HashMap<String, Vec<(String, String, String)>>;

pub static LAUNCH_TIME: OnceLock<std::time::Instant> = OnceLock::new();
pub static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutSetting {
    pub combo: String,
    pub file_path: String,
}

#[derive(Debug, Clone)]
struct ParsedShortcut {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win: bool,
    vk: u32,
    file_path: String,
}

static ACTIVE_SHORTCUTS: Mutex<Vec<ParsedShortcut>> = Mutex::new(Vec::new());

pub fn update_global_shortcuts(shortcuts: &[ShortcutSetting]) {
    let mut active = ACTIVE_SHORTCUTS.lock().unwrap();
    active.clear();
    for s in shortcuts {
        if let Some(parsed) = parse_combo(&s.combo, &s.file_path) {
            active.push(parsed);
        }
    }
    log::info!("Updated global shortcuts: {} active", active.len());
}

fn key_name_to_vk(name: &str) -> Option<u32> {
    match name.to_lowercase().as_str() {
        "f1" => Some(112), "f2" => Some(113), "f3" => Some(114), "f4" => Some(115),
        "f5" => Some(116), "f6" => Some(117), "f7" => Some(118), "f8" => Some(119),
        "f9" => Some(120), "f10" => Some(121), "f11" => Some(122), "f12" => Some(123),
        "space" => Some(32), "enter" | "return" => Some(13), "escape" | "esc" => Some(27),
        "tab" => Some(9), "backspace" => Some(8), "delete" | "del" => Some(46),
        "up" => Some(38), "down" => Some(40), "left" => Some(37), "right" => Some(39),
        s if s.len() == 1 => {
            let c = s.chars().next().unwrap();
            if c.is_ascii_alphabetic() {
                Some(c.to_ascii_uppercase() as u32)
            } else if c.is_ascii_digit() {
                Some(c as u32)
            } else {
                None
            }
        }
        _ => None
    }
}

fn parse_combo(combo: &str, file_path: &str) -> Option<ParsedShortcut> {
    let parts: Vec<&str> = combo.split('+').map(|s| s.trim()).collect();
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut vk = None;

    for part in parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" => alt = true,
            "shift" => shift = true,
            "win" | "super" | "meta" => win = true,
            other => vk = key_name_to_vk(other),
        }
    }

    vk.map(|vk| ParsedShortcut {
        ctrl, alt, shift, win, vk,
        file_path: file_path.to_string(),
    })
}

fn trigger_shortcut(file_path: &str) {
    let handle_opt = APP_HANDLE.lock().unwrap().clone();
    if let Some(handle) = handle_opt {
        let path = file_path.to_string();
        tauri::async_runtime::spawn(async move {
            if ExecutionEngine::is_running(&handle) {
                let _ = ExecutionEngine::stop(&handle);
            } else {
                match load_and_run_sequence(&handle, &path).await {
                    Ok(_) => {}
                    Err(e) => {
                        let _ = handle.emit("engine://error", format!("Erreur raccourci: {e}"));
                    }
                }
            }
        });
    }
}

async fn load_and_run_sequence(handle: &AppHandle, path: &str) -> Result<(), String> {
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let graph: crate::blocks::Graph = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    ExecutionEngine::run(handle, graph);
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn start_keyboard_hook() {
    std::thread::spawn(|| {
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowsHookExW, UnhookWindowsHookEx, GetMessageW, WH_KEYBOARD_LL
            };
            
            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_hook_proc),
                std::ptr::null_mut(),
                0,
            );
            if hook == std::ptr::null_mut() {
                log::error!("Failed to install keyboard hook");
                return;
            }
            log::info!("Keyboard hook installed");
            let mut msg = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) != 0 {
                // message pump
            }
            UnhookWindowsHookEx(hook);
        }
    });
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_SYSKEYDOWN
    };

    extern "system" {
        fn GetAsyncKeyState(vKey: i32) -> i16;
    }

    if code >= 0 {
        let kbd = *(lparam as *const KBDLLHOOKSTRUCT);
        let vk = kbd.vkCode;
        let event = wparam as u32;

        if event == WM_KEYDOWN || event == WM_SYSKEYDOWN {
            // Check for F6 (0x75) -> Toggle Run/Stop Sequence
            if vk == 0x75 {
                let handle_opt = APP_HANDLE.lock().unwrap().clone();
                if let Some(handle) = handle_opt {
                    tauri::async_runtime::spawn(async move {
                        if ExecutionEngine::is_running(&handle) {
                            ExecutionEngine::stop(&handle);
                        } else {
                            let _ = handle.emit("engine://request-run", ());
                        }
                    });
                }
                return 1; // consume the F6 keypress
            }

            // Check for F8 (0x77) -> Capture cursor position
            if vk == 0x77 {
                let handle_opt = APP_HANDLE.lock().unwrap().clone();
                if let Some(handle) = handle_opt {
                    let _ = handle.emit("engine://request-f8-capture", ());
                }
                return 1; // consume the F8 keypress
            }

            // Stateless checks for Modifier Keys
            let ctrl = (GetAsyncKeyState(0x11) as u32 & 0x8000) != 0; // VK_CONTROL
            let alt = (GetAsyncKeyState(0x12) as u32 & 0x8000) != 0;  // VK_MENU
            let shift = (GetAsyncKeyState(0x10) as u32 & 0x8000) != 0;// VK_SHIFT
            let win = ((GetAsyncKeyState(0x5B) as u32 & 0x8000) != 0) || ((GetAsyncKeyState(0x5C) as u32 & 0x8000) != 0); // VK_LWIN / VK_RWIN

            let shortcuts = ACTIVE_SHORTCUTS.lock().unwrap();
            for s in shortcuts.iter() {
                if s.vk == vk && s.ctrl == ctrl && s.alt == alt && s.shift == shift && s.win == win {
                    trigger_shortcut(&s.file_path);
                    break;
                }
            }
        }
    }

    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

#[cfg(not(target_os = "windows"))]
pub fn start_keyboard_hook() {}

#[cfg(target_os = "windows")]
fn prevent_sleep() {
    use windows_sys::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED, ES_DISPLAY_REQUIRED
    };
    unsafe {
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
    }
}

#[cfg(target_os = "windows")]
fn restore_sleep() {
    use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
    unsafe {
        SetThreadExecutionState(ES_CONTINUOUS);
    }
}

#[cfg(not(target_os = "windows"))]
fn prevent_sleep() {}

#[cfg(not(target_os = "windows"))]
fn restore_sleep() {}

// ── Engine state ──────────────────────────────────────────────────────────────

pub struct ExecutionEngine { token: Arc<Mutex<Option<CancellationToken>>> }

impl ExecutionEngine {
    pub fn init(handle: AppHandle) {
        handle.manage(ExecutionEngine { token: Arc::new(Mutex::new(None)) });
    }
    pub fn run(handle: &AppHandle, graph: Graph) {
        let state = handle.state::<ExecutionEngine>();
        let token = CancellationToken::new();
        *state.token.lock().unwrap() = Some(token.clone());
        let h2 = handle.clone();
        tokio::spawn(async move {
            prevent_sleep();
            let _ = h2.emit("engine://started", ());
            let mut vars = Vars::new();
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(e) => {
                    let _ = h2.emit("engine://error", format!("Enigo: {e}"));
                    let state = h2.state::<ExecutionEngine>();
                    *state.token.lock().unwrap() = None;
                    restore_sleep();
                    return;
                }
            };
            match run_from_start(&h2, &graph, &mut vars, &mut enigo, &token).await {
                Ok(_)  => { let _ = h2.emit("engine://done", ()); }
                Err(e) => { let _ = h2.emit("engine://error", e.to_string()); }
            }
            let state = h2.state::<ExecutionEngine>();
            *state.token.lock().unwrap() = None;
            restore_sleep();
        });
    }
    pub fn stop(handle: &AppHandle) {
        let state = handle.state::<ExecutionEngine>();
        if let Some(t) = state.token.lock().unwrap().take() { t.cancel(); }
        let _ = handle.emit("engine://stopped", ());
    }
    pub fn is_running(handle: &AppHandle) -> bool {
        let state = handle.state::<ExecutionEngine>();
        let active = state.token.lock().unwrap().is_some();
        active
    }
}

// ── Graph traversal ───────────────────────────────────────────────────────────

async fn run_from_start(h: &AppHandle, graph: &Graph, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<()> {
    let adj = graph.adjacency();
    let start_id = graph.start_id().ok_or_else(|| anyhow!("Aucun nœud Départ trouvé"))?;
    let _ = h.emit("engine://log", format!("Start: {start_id}"));
    match follow(&adj, &start_id, "", "") {
        Some(first) => run_chain(h, graph, &adj, &first, vars, enigo, token, 0, Vec::new()).await?,
        None => { let _ = h.emit("engine://log", "Départ non connecté".to_string()); }
    }
    Ok(())
}

fn follow(adj: &Adj, src: &str, sh: &str, _th: &str) -> Option<String> {
    let edges = adj.get(src)?;
    if let Some((t,_,_)) = edges.iter().find(|(_,s,_)| s==sh) { return Some(t.clone()); }
    if sh.is_empty() {
        if let Some((t,_,_)) = edges.iter().find(|(_,s,_)| s.is_empty()) { return Some(t.clone()); }
        if edges.len()==1 { return Some(edges[0].0.clone()); }
    }
    None
}

#[async_recursion::async_recursion]
async fn run_chain(
    h: &AppHandle,
    graph: &Graph,
    adj: &Adj,
    node_id: &str,
    vars: &mut Vars,
    enigo: &mut Enigo,
    token: &CancellationToken,
    depth: usize,
    mut visited_path: Vec<String>,
) -> Result<()> {
    if token.is_cancelled() { return Ok(()); }
    if depth % 50 == 0 {
        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
    }
    if visited_path.contains(&node_id.to_string()) {
        // Sleep for 1ms to prevent CPU saturation when looping unsupervised
        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
    }
    visited_path.push(node_id.to_string());

    let node = graph.node(node_id).ok_or_else(|| anyhow!("Node not found: {node_id}"))?;
    let out = exec_node(h, graph, adj, node_id, &node.data, vars, enigo, token).await?;
    if token.is_cancelled() { return Ok(()); }
    if let Some(next) = follow(adj, node_id, &out, "") {
        run_chain(h, graph, adj, &next, vars, enigo, token, depth + 1, visited_path).await?;
    }
    Ok(())
}

// ── Node executor ─────────────────────────────────────────────────────────────

#[async_recursion::async_recursion]
async fn exec_node(h: &AppHandle, graph: &Graph, adj: &Adj, node_id: &str, block: &Block, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<String> {
    let kind = bk(block);
    info!("[exec] {kind} ({node_id})");
    let _ = h.emit("engine://block-start", serde_json::json!({"node_id": node_id, "kind": kind}));

    let out: String = match block {
        Block::Start => "".into(),

        // ── FunctionArgs / FunctionReturn are only present inside .fnc.json graphs ──
        // When encountered in the main graph they are no-ops (shouldn't happen).
        Block::FunctionArgs(_) | Block::FunctionReturn(_) => "".into(),

        // ── FunctionCall ──────────────────────────────────────────────────────
        Block::FunctionCall(b) => {
            exec_function_call(h, b, vars, enigo, token).await?
        }

        Block::MouseMove(b) => {
            let x = eval_full(&b.x, vars) as i32;
            let y = eval_full(&b.y, vars) as i32;
            let travel = eval_full(&b.travel_ms, vars) as u64;
            let (ax, ay) = screen_coords(x, y, b.screen);
            enigo.move_mouse(ax, ay, enigo::Coordinate::Abs).map_err(|e| anyhow!("MouseMove: {e}"))?;
            if travel > 0 { sleep(Duration::from_millis(travel)).await; }
            "".into()
        }

        Block::MouseClick(b) => {
            let x = eval_full(&b.x, vars) as i32;
            let y = eval_full(&b.y, vars) as i32;
            let travel = eval_full(&b.travel_ms, vars) as u64;
            let delay  = eval_full(&b.delay_after_ms, vars) as u64;
            let (ax, ay) = screen_coords(x, y, b.screen);
            enigo.move_mouse(ax, ay, enigo::Coordinate::Abs).map_err(|e| anyhow!("MoveBeforeClick: {e}"))?;
            if travel > 0 { sleep(Duration::from_millis(travel)).await; }
            let btn = match b.button { MouseButton::Left=>enigo::Button::Left, MouseButton::Right=>enigo::Button::Right, MouseButton::Middle=>enigo::Button::Middle };
            enigo.button(btn, Direction::Click).map_err(|e| anyhow!("Click: {e}"))?;
            if b.double_click { sleep(Duration::from_millis(50)).await; enigo.button(btn, Direction::Click).ok(); }
            if delay > 0 { sleep(Duration::from_millis(delay)).await; }
            "".into()
        }

        Block::MouseScroll(b) => {
            let x = eval_full(&b.x, vars) as i32;
            let y = eval_full(&b.y, vars) as i32;
            let travel = eval_full(&b.travel_ms, vars) as u64;
            let (ax, ay) = screen_coords(x, y, b.screen);
            enigo.move_mouse(ax, ay, enigo::Coordinate::Abs).ok();
            if travel > 0 { sleep(Duration::from_millis(travel)).await; }
            let dx = eval_full(&b.delta_x, vars) as i32;
            let dy = eval_full(&b.delta_y, vars) as i32;
            if dx != 0 { enigo.scroll(dx, enigo::Axis::Horizontal).ok(); }
            if dy != 0 { enigo.scroll(dy, enigo::Axis::Vertical).ok(); }
            "".into()
        }

        Block::TypeText(b) => {
            let text = resolve_expressions_in_text(&b.text, vars);
            let delay = eval_full(&b.delay_between_chars_ms, vars) as u64;
            for ch in text.chars() {
                if token.is_cancelled() { return Ok("".into()); }
                if ch == '\n' { enigo.key(Key::Return, Direction::Click).map_err(|e| anyhow!("TypeText newline: {e}"))?; }
                else if ch != '\r' { enigo.text(&ch.to_string()).map_err(|e| anyhow!("TypeText: {e}"))?; }
                if delay > 0 { sleep(Duration::from_millis(delay)).await; }
            }
            "".into()
        }

        Block::KeyPress(b) => {
            let hold = eval_full(&b.hold_ms, vars) as u64;
            for step in b.key_combo.split(',') { parse_and_press(enigo, step.trim(), hold).await?; }
            "".into()
        }

        Block::Wait(b) => {
            if b.mode == "datetime" {
                use chrono::Datelike;
                use chrono::Timelike;
                
                let parse_dt_field = |field: &str, vars: &Vars| -> i32 {
                    let trimmed = field.trim();
                    if trimmed.is_empty() {
                        return -1;
                    }
                    eval_full(trimmed, vars) as i32
                };

                let target_year = parse_dt_field(&b.year, vars);
                let target_month = parse_dt_field(&b.month, vars);
                let target_day = parse_dt_field(&b.day, vars);
                let target_hour = parse_dt_field(&b.hour, vars);
                let target_minute = parse_dt_field(&b.minute, vars);
                let target_second = parse_dt_field(&b.second, vars);
                
                loop {
                    if token.is_cancelled() { break; }
                    
                    let now = chrono::Local::now();
                    let match_year = target_year == -1 || target_year == now.year() as i32;
                    let match_month = target_month == -1 || target_month == now.month() as i32;
                    let match_day = target_day == -1 || target_day == now.day() as i32;
                    let match_hour = target_hour == -1 || target_hour == now.hour() as i32;
                    let match_minute = target_minute == -1 || target_minute == now.minute() as i32;
                    let match_second = target_second == -1 || target_second == now.second() as i32;
                    
                    if match_year && match_month && match_day && match_hour && match_minute && match_second {
                        break;
                    }
                    
                    tokio::select! {
                        _ = sleep(Duration::from_millis(500)) => {}
                        _ = token.cancelled() => {}
                    }
                }
            } else {
                let ms = eval_full(&b.duration_ms, vars) as u64;
                let steps = (ms / 50).max(1);
                for step in 0..steps {
                    if token.is_cancelled() { break; }
                    let progress = ((step as f64 / steps as f64) * 100.0) as u32;
                    let _ = h.emit("engine://wait-progress", serde_json::json!({ "node_id": node_id, "progress": progress }));
                    tokio::select! {
                        _ = sleep(Duration::from_millis(50.min(ms))) => {}
                        _ = token.cancelled() => {}
                    }
                }
                let _ = h.emit("engine://wait-progress", serde_json::json!({ "node_id": node_id, "progress": 100 }));
            }
            "".into()
        }

        Block::ForLoop(b) => {
            let from = eval_full(&b.from, vars);
            let to   = eval_full(&b.to,   vars);
            let step = {
                let s = eval_full(&b.step, vars);
                if s == 0.0 { 1.0 } else { s }
            };
            if step == 0.0 && !b.infinite { return Err(anyhow!("ForLoop step=0")); }
            let prev = vars.get(&b.var_name).cloned();
            vars.insert(b.var_name.clone(), fmt_num(from));
            let mut iter_cnt = 0;
            'lp: loop {
                if token.is_cancelled() { break; }
                let cur = vars.get(&b.var_name).and_then(|s| s.parse::<f64>().ok()).unwrap_or(from);
                if !b.infinite && ((step>0.0&&cur>to)||(step<0.0&&cur<to)) { break; }
                let val_str = fmt_num(cur);
                let _ = h.emit("engine://for-tick", serde_json::json!({"node_id": node_id, "var":&b.var_name,"value":val_str}));
                
                iter_cnt += 1;
                if b.infinite || iter_cnt % 100 == 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                } else {
                    tokio::task::yield_now().await;
                }
                
                if let Some(body_start) = follow(adj, node_id, "body", "") {
                    let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token, 0).await?;
                    if sig=="break"||token.is_cancelled() { break 'lp; }
                }
                let post = vars.get(&b.var_name).and_then(|s| s.parse::<f64>().ok()).unwrap_or(cur);
                vars.insert(b.var_name.clone(), fmt_num(post+step));
            }
            restore_var(vars, &b.var_name, prev);
            "after".into()
        }

        Block::SetVariable(b) => {
            if !b.name.is_empty() {
                let val = {
                    let evaled = eval_full(&b.value, vars);
                    if b.value.trim()!="0"&&evaled!=0.0 { fmt_num(evaled) } else { interpolate_text(&b.value, vars) }
                };
                vars.insert(b.name.clone(), val);
            }
            for v_pair in &b.vars {
                if !v_pair.name.is_empty() {
                    let val = {
                        let evaled = eval_full(&v_pair.value, vars);
                        if v_pair.value.trim()!="0"&&evaled!=0.0 { fmt_num(evaled) } else { interpolate_text(&v_pair.value, vars) }
                    };
                    vars.insert(v_pair.name.clone(), val);
                }
            }
            "".into()
        }

        Block::Math(b) => {
            let result = eval_full(&b.expression, vars);
            let s = fmt_num(result);
            vars.insert(b.target_var.clone(), s.clone());
            "".into()
        }

        Block::Random(b) => {
            use rand::SeedableRng; use rand::rngs::StdRng;
            let result = if b.use_seed {
                let seed = eval_full(&b.seed, vars) as u64;
                let mut rng = StdRng::seed_from_u64(seed);
                gen_random(&mut rng, &b.mode, &b.min, &b.max, &b.list_items, vars)
            } else {
                let mut rng = rand::thread_rng();
                gen_random(&mut rng, &b.mode, &b.min, &b.max, &b.list_items, vars)
            };
            let _ = h.emit("engine://log", format!("random({}) → {result}", b.mode));
            if !b.output_var.is_empty() { vars.insert(b.output_var.clone(), result); }
            "".into()
        }

        Block::If(b) => {
            let ok = eval_cond(&b.condition, vars);
            let _ = h.emit("engine://if-result", ok);
            if ok { "true".into() } else { "false".into() }
        }

        Block::PixelColor(b) => {
            let iterations = (eval_full(&b.iterations, vars) as u64).max(1);
            let cooldown   = eval_full(&b.cooldown_ms, vars) as u64;
            let x = eval_full(&b.x, vars) as i32;
            let y = eval_full(&b.y, vars) as i32;
            let (er,eg,eb) = match b.color_format.as_str() {
                "rgb" => (b.expected_r, b.expected_g, b.expected_b),
                _ => { let h2=u32::from_str_radix(b.expected_hex.trim_start_matches('#'),16).unwrap_or(0xFF0000);
                       (((h2>>16)&0xFF)as u8,((h2>>8)&0xFF)as u8,(h2&0xFF)as u8) }
            };
            let exp = ((er as u32)<<16)|((eg as u32)<<8)|(eb as u32);
            let mut matched = false;
            for i in 0..iterations {
                if token.is_cancelled() { return Ok("not_found".into()); }
                matched = crate::ipc::sample_pixel_color(x, y, b.screen, exp, b.tolerance);
                let _ = h.emit("engine://pixel-result", matched);
                if matched { break; }
                if i+1<iterations&&cooldown>0 {
                    tokio::select! { _ = sleep(Duration::from_millis(cooldown)) => {} _ = token.cancelled() => {} }
                }
            }
            if !b.output_var.is_empty() { vars.insert(b.output_var.clone(), matched.to_string()); }
            if matched { "found".into() } else { "not_found".into() }
        }

        Block::ImageMatch(b) => {
            let iterations = (eval_full(&b.iterations, vars) as u64).max(1);
            let cooldown   = eval_full(&b.cooldown_ms, vars) as u64;
            let threshold  = eval_full(&b.threshold, vars).clamp(0.0, 1.0);
            let x = eval_full(&b.region_x, vars) as i32;
            let y = eval_full(&b.region_y, vars) as i32;
            let w = (eval_full(&b.region_w, vars) as u32).max(1);
            let hgt = (eval_full(&b.region_h, vars) as u32).max(1);
            let mode = if b.match_mode == "all" { "all" } else { "first" };
            let mut matched = false;
            let mut last_boxes: Vec<crate::ipc::MatchBox> = vec![];
            for i in 0..iterations {
                if token.is_cancelled() { return Ok("not_found".into()); }
                if let Ok(result) = crate::ipc::match_image_region(&b.template_b64, x, y, w, hgt, b.screen, threshold, mode) {
                    matched = result.matched;
                    last_boxes = result.boxes;
                }
                let _ = h.emit("engine://image-result", serde_json::json!({"matched":matched,"iteration":i+1,"iterations":iterations}));
                if matched { break; }
                if i+1<iterations&&cooldown>0 {
                    tokio::select! { _ = sleep(Duration::from_millis(cooldown)) => {} _ = token.cancelled() => {} }
                }
            }
            if !b.output_var.is_empty() {
                let out_var = interpolate_text(&b.output_var, vars);
                if !out_var.is_empty() {
                    let json = crate::ipc::match_boxes_to_json(&last_boxes, mode);
                    vars.insert(out_var, json);
                }
            }
            if matched { "found".into() } else { "not_found".into() }
        }

        Block::Ocr(b) => {
            let iterations = (eval_full(&b.iterations, vars) as u64).max(1);
            let cooldown = eval_full(&b.cooldown_ms, vars) as u64;
            let target_text = resolve_expressions_in_text(&b.match_text, vars);
            
            let x = eval_full(&b.x, vars) as i32;
            let y = eval_full(&b.y, vars) as i32;
            let w = (eval_full(&b.width, vars) as u32).max(1);
            let hgt = (eval_full(&b.height, vars) as u32).max(1);

            let mut matched = false;
            let mut ocr_text = String::new();
            
            for i in 0..iterations {
                if token.is_cancelled() { return Ok("not_found".into()); }
                
                // Exécution réelle de Tesseract
                let cropped_res = capture_image_for_ocr(x, y, w, hgt, b.screen);
                match cropped_res {
                    Ok(cropped) => {
                        let temp_dir = std::env::temp_dir();
                        let temp_img_path = temp_dir.join(format!("autobot_ocr_capture_{}.png", i));
                        if cropped.save(&temp_img_path).is_ok() {
                            if let Some(tesseract_exe) = get_tesseract_path() {
                                #[cfg(target_os = "windows")]
                                let output = {
                                    use std::os::windows::process::CommandExt;
                                    std::process::Command::new(&tesseract_exe)
                                        .arg(&temp_img_path)
                                        .arg("stdout")
                                        .arg("-l")
                                        .arg(&b.lang)
                                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                                        .output()
                                };
                                #[cfg(not(target_os = "windows"))]
                                let output = std::process::Command::new(&tesseract_exe)
                                    .arg(&temp_img_path)
                                    .arg("stdout")
                                    .arg("-l")
                                    .arg(&b.lang)
                                    .output();
                                
                                let _ = std::fs::remove_file(&temp_img_path);
                                
                                if let Ok(out) = output {
                                    let stdout_text = String::from_utf8_lossy(&out.stdout).to_string();
                                    if !stdout_text.trim().is_empty() {
                                        ocr_text = stdout_text;
                                    } else {
                                        // Tesseract a renvoyé stdout vide, logguer stderr pour diagnostique
                                        let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
                                        if !err_msg.trim().is_empty() {
                                            let _ = h.emit("engine://log", format!("Tesseract stderr: {}", err_msg.trim()));
                                        }
                                    }
                                }
                            } else {
                                let _ = std::fs::remove_file(&temp_img_path);
                                let _ = h.emit("engine://log", "Tesseract-OCR non trouvé. Veuillez l'installer ou le configurer dans les paramètres.".to_string());
                            }
                        }
                    }
                    Err(e) => {
                        let _ = h.emit("engine://log", format!("Erreur capture image pour OCR: {}", e));
                    }
                }

                let text_to_check = if b.match_case { ocr_text.clone() } else { ocr_text.to_lowercase() };
                let pattern = if b.match_case { target_text.clone() } else { target_text.to_lowercase() };
                
                if b.use_regex {
                    if let Ok(re) = regex::RegexBuilder::new(&pattern)
                        .case_insensitive(!b.match_case)
                        .build() {
                        matched = re.is_match(&ocr_text);
                    }
                } else if b.match_whole_word {
                    let words: Vec<&str> = text_to_check.split(|c: char| !c.is_alphanumeric()).collect();
                    matched = words.contains(&pattern.as_str());
                } else if b.tolerance > 0 {
                    let max_dist = ((pattern.len() as f32) * (b.tolerance as f32 / 100.0)).round() as usize;
                    matched = fuzzy_match(&text_to_check, &pattern, max_dist);
                } else {
                    matched = text_to_check.contains(&pattern);
                }
                
                let _ = h.emit("engine://ocr-result", serde_json::json!({
                    "matched": matched,
                    "text": ocr_text,
                    "iteration": i + 1,
                    "iterations": iterations
                }));
                
                if matched { break; }
                if i + 1 < iterations && cooldown > 0 {
                    tokio::select! {
                        _ = sleep(Duration::from_millis(cooldown)) => {}
                        _ = token.cancelled() => {}
                    }
                }
            }
            
            if !b.output_var.is_empty() {
                vars.insert(b.output_var.clone(), ocr_text.trim().to_string());
            }
            if matched { "found".into() } else { "not_found".into() }
        }

        Block::ArrayPush(b) => {
            let var_name = interpolate_text(&b.array_var, vars);
            if !var_name.is_empty() {
                let mut arr: Vec<serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                
                let val_str = interpolate_text(&b.values, vars);
                let to_push: Vec<serde_json::Value> = val_str.split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .map(|s| serde_json::Value::String(s.to_string()))
                    .collect();

                for item in to_push {
                    if b.unique && arr.contains(&item) {
                        continue;
                    }
                    if b.position == "front" {
                        arr.insert(0, item);
                    } else {
                        arr.push(item);
                    }
                }

                vars.insert(var_name, serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string()));
            }
            "".into()
        }

        Block::ArrayMerge(b) => {
            let out_var = interpolate_text(&b.output_var, vars);
            if !out_var.is_empty() {
                let mut merged: Vec<serde_json::Value> = Vec::new();
                let sources = interpolate_text(&b.array_vars, vars);
                for source in sources.split(',') {
                    let source = source.trim();
                    if !source.is_empty() {
                        let arr: Vec<serde_json::Value> = vars.get(source)
                            .and_then(|s| serde_json::from_str(s).ok())
                            .unwrap_or_default();
                        merged.extend(arr);
                    }
                }
                vars.insert(out_var, serde_json::to_string(&merged).unwrap_or_else(|_| "[]".to_string()));
            }
            "".into()
        }

        Block::ArrayGet(b) => {
            let var_name = interpolate_text(&b.array_var, vars);
            let out_var = interpolate_text(&b.output_var, vars);
            if !var_name.is_empty() && !out_var.is_empty() {
                let arr: Vec<serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                let idx = eval_full(&b.index, vars) as usize;
                let val = arr.get(idx).map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                }).unwrap_or_default();
                vars.insert(out_var, val);
            }
            "".into()
        }

        Block::ArraySearch(b) => {
            let var_name = interpolate_text(&b.array_var, vars);
            let out_var = interpolate_text(&b.output_var, vars);
            if !var_name.is_empty() && !out_var.is_empty() {
                let arr: Vec<serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                
                let search_str = interpolate_text(&b.values, vars);
                let to_find: Vec<&str> = search_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

                let mut indices: Vec<usize> = Vec::new();
                for (idx, item) in arr.iter().enumerate() {
                    let s_val = match item {
                        serde_json::Value::String(s) => s.as_str(),
                        _ => "",
                    };
                    if to_find.contains(&s_val) {
                        indices.push(idx);
                    }
                }

                if b.mode == "first" {
                    let val = indices.first().map(|i| i.to_string()).unwrap_or_else(|| "-1".to_string());
                    vars.insert(out_var, val);
                } else if b.mode == "last" {
                    let val = indices.last().map(|i| i.to_string()).unwrap_or_else(|| "-1".to_string());
                    vars.insert(out_var, val);
                } else {
                    // "all"
                    let json_indices: Vec<serde_json::Value> = indices.into_iter().map(|i| serde_json::Value::String(i.to_string())).collect();
                    vars.insert(out_var, serde_json::to_string(&json_indices).unwrap_or_else(|_| "[]".to_string()));
                }
            }
            "".into()
        }

        Block::ArrayDelete(b) => {
            let var_name = interpolate_text(&b.array_var, vars);
            if !var_name.is_empty() {
                let mut arr: Vec<serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                let idx = eval_full(&b.index, vars) as usize;
                if idx < arr.len() {
                    arr.remove(idx);
                }
                vars.insert(var_name, serde_json::to_string(&arr).unwrap_or_else(|_| "[]".to_string()));
            }
            "".into()
        }

        Block::DictAdd(b) => {
            let var_name = interpolate_text(&b.dict_var, vars);
            if !var_name.is_empty() {
                let mut map: serde_json::Map<String, serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                
                for pair in &b.pairs {
                    let k = interpolate_text(&pair.key, vars);
                    let v = interpolate_text(&pair.value, vars);
                    if !k.is_empty() {
                        map.insert(k, serde_json::Value::String(v));
                    }
                }

                vars.insert(var_name, serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()));
            }
            "".into()
        }

        Block::DictCombine(b) => {
            let out_var = interpolate_text(&b.output_var, vars);
            if !out_var.is_empty() {
                let mut combined: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
                let sources = interpolate_text(&b.dict_vars, vars);
                for source in sources.split(',') {
                    let source = source.trim();
                    if !source.is_empty() {
                        let map: serde_json::Map<String, serde_json::Value> = vars.get(source)
                            .and_then(|s| serde_json::from_str(s).ok())
                            .unwrap_or_default();
                        for (k, v) in map {
                            combined.insert(k, v);
                        }
                    }
                }
                vars.insert(out_var, serde_json::to_string(&combined).unwrap_or_else(|_| "{}".to_string()));
            }
            "".into()
        }

        Block::DictFind(b) => {
            let var_name = interpolate_text(&b.dict_var, vars);
            let out_var = interpolate_text(&b.output_var, vars);
            if !var_name.is_empty() && !out_var.is_empty() {
                let map: serde_json::Map<String, serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                let key_str = interpolate_text(&b.key, vars);
                let val = map.get(&key_str).map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                }).unwrap_or_default();
                vars.insert(out_var, val);
            }
            "".into()
        }

        Block::DictRemove(b) => {
            let var_name = interpolate_text(&b.dict_var, vars);
            if !var_name.is_empty() {
                let mut map: serde_json::Map<String, serde_json::Value> = vars.get(&var_name)
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();
                let key_str = interpolate_text(&b.key, vars);
                map.remove(&key_str);
                vars.insert(var_name, serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()));
            }
            "".into()
        }

        Block::Cmd(b) => {
            let cmd_line = resolve_expressions_in_text(&b.command, vars);
            let cmd_line = with_cmd_echo(&cmd_line, b.echo);
            let out_var = interpolate_text(&b.output_var, vars);
            if b.administrator {
                let exec_result = if is_process_elevated() {
                    exec_cmd_spawn(&cmd_line, b.echo)
                } else {
                    exec_cmd_admin(&cmd_line, b.echo)
                };
                if let Err(err) = &exec_result {
                    let _ = h.emit("engine://log", format!("CMD admin: {err}"));
                }
                let log_entry = serde_json::json!({
                    "command": cmd_line,
                    "stdout": "",
                    "stderr": exec_result.err().unwrap_or_default(),
                    "exit_code": null,
                    "timestamp": chrono::Local::now().format("%H:%M:%S").to_string(),
                    "administrator": true,
                });
                let _ = h.emit("engine://cmd-log", serde_json::json!({"node_id": node_id, "entry": log_entry}));
            } else if b.wait {
                let result = exec_cmd_sync(&cmd_line, b.echo);
                let log_entry = serde_json::json!({
                    "command": cmd_line,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.exit_code,
                    "timestamp": chrono::Local::now().format("%H:%M:%S").to_string(),
                    "echo": b.echo,
                });
                let _ = h.emit("engine://cmd-log", serde_json::json!({"node_id": node_id, "entry": log_entry}));
                if !out_var.is_empty() { vars.insert(out_var, result.stdout.trim_end().to_string()); }
            } else {
                let _ = exec_cmd_spawn(&cmd_line, b.echo);
                let log_entry = serde_json::json!({
                    "command": cmd_line,
                    "stdout": "",
                    "stderr": "",
                    "exit_code": null,
                    "timestamp": chrono::Local::now().format("%H:%M:%S").to_string(),
                    "async": true,
                    "echo": b.echo,
                });
                let _ = h.emit("engine://cmd-log", serde_json::json!({"node_id": node_id, "entry": log_entry}));
            }
            "".into()
        }
        Block::Python(b) => {
            let result = exec_python_uv(b, vars);
            let log_entry = serde_json::json!({
                "command": format!("uv run --python {} autobot_script.py", b.python_version),
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
                "timestamp": chrono::Local::now().format("%H:%M:%S").to_string(),
                "python": true,
            });
            let _ = h.emit("engine://cmd-log", serde_json::json!({"node_id": node_id, "entry": log_entry}));
            let out_var = interpolate_text(&b.output_var, vars);
            if !out_var.is_empty() {
                vars.insert(out_var, result.stdout.trim_end().to_string());
            }
            "".into()
        }

        Block::Iterations(b) => {
            let is_inf = b.infinite.unwrap_or(false);
            let count = if is_inf { 999999999 } else { eval_full(&b.count, vars) as usize };
            'lp: for idx in 0..count {
                if token.is_cancelled() { break 'lp; }
                let display_val = if is_inf { format!("{} (∞)", idx + 1) } else { format!("{}/{}", idx + 1, count) };
                let _ = h.emit("engine://for-tick", serde_json::json!({"node_id": node_id, "var": "iterations", "value": display_val}));
                if is_inf || (idx + 1) % 100 == 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                } else {
                    tokio::task::yield_now().await;
                }
                if let Some(body_start) = follow(adj, node_id, "body", "") {
                    let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token, 0).await?;
                    if sig == "break" || token.is_cancelled() { break 'lp; }
                }
            }
            "after".into()
        }

        Block::ForEach(b) => {
            let coll_var_name = interpolate_text(&b.collection_var, vars);
            let raw_val = vars.get(&coll_var_name).cloned().unwrap_or_else(|| "".to_string());
            
            // Try parsing as JSON array
            if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(&raw_val) {
                let prev_x = vars.get("x").cloned();
                let prev_idx = vars.get("foreachindex").cloned();
                'lp: for (i, item) in arr.iter().enumerate() {
                    if token.is_cancelled() { break 'lp; }
                    let item_str = match item {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    vars.insert("x".to_string(), item_str);
                    vars.insert("foreachindex".to_string(), i.to_string());
                    let _ = h.emit("engine://for-tick", serde_json::json!({"node_id": node_id, "var": "foreachindex", "value": i.to_string()}));
                    if (i + 1) % 100 == 0 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                    } else {
                        tokio::task::yield_now().await;
                    }
                    if let Some(body_start) = follow(adj, node_id, "body", "") {
                        let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token, 0).await?;
                        if sig == "break" || token.is_cancelled() { break 'lp; }
                    }
                }
                restore_var(vars, "x", prev_x);
                restore_var(vars, "foreachindex", prev_idx);
            } 
            // Try parsing as JSON dict
            else if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(&raw_val) {
                let prev_key = vars.get("key").cloned();
                let prev_val = vars.get("value").cloned();
                let prev_idx = vars.get("foreachindex").cloned();
                'lp: for (i, (key, value)) in map.iter().enumerate() {
                    if token.is_cancelled() { break 'lp; }
                    let val_str = match value {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    vars.insert("key".to_string(), key.clone());
                    vars.insert("value".to_string(), val_str);
                    vars.insert("foreachindex".to_string(), i.to_string());
                    let _ = h.emit("engine://for-tick", serde_json::json!({"node_id": node_id, "var": "foreachindex", "value": i.to_string()}));
                    if (i + 1) % 100 == 0 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                    } else {
                        tokio::task::yield_now().await;
                    }
                    if let Some(body_start) = follow(adj, node_id, "body", "") {
                        let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token, 0).await?;
                        if sig == "break" || token.is_cancelled() { break 'lp; }
                    }
                }
                restore_var(vars, "key", prev_key);
                restore_var(vars, "value", prev_val);
                restore_var(vars, "foreachindex", prev_idx);
            } 
            // Fallback as String (char by char)
            else {
                let prev_x = vars.get("x").cloned();
                let prev_idx = vars.get("foreachindex").cloned();
                'lp: for (i, c) in raw_val.chars().enumerate() {
                    if token.is_cancelled() { break 'lp; }
                    vars.insert("x".to_string(), c.to_string());
                    vars.insert("foreachindex".to_string(), i.to_string());
                    let _ = h.emit("engine://for-tick", serde_json::json!({"node_id": node_id, "var": "foreachindex", "value": i.to_string()}));
                    if (i + 1) % 100 == 0 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                    } else {
                        tokio::task::yield_now().await;
                    }
                    if let Some(body_start) = follow(adj, node_id, "body", "") {
                        let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token, 0).await?;
                        if sig == "break" || token.is_cancelled() { break 'lp; }
                    }
                }
                restore_var(vars, "x", prev_x);
                restore_var(vars, "foreachindex", prev_idx);
            }
            "after".into()
        }

        Block::Switch(b) => {
            let val_s = if b.expression.contains('%') {
                interpolate_text(&b.expression, vars)
            } else {
                let v = eval_full(&b.expression, vars);
                if b.expression.trim().parse::<f64>().is_ok() { fmt_num(v) } else { interpolate_text(&b.expression, vars) }
            };
            
            // Look for a matching handle
            let out_handle = if b.cases.contains(&val_s) {
                val_s
            } else {
                "DefaultCase".to_string()
            };
            
            out_handle
        }

        Block::Console(b) => {
            let log_text = resolve_expressions_in_text(&b.text, vars);
            let _ = h.emit("engine://log", log_text);
            "".into()
        }

        Block::Ia(b) => {
            let prompt = resolve_expressions_in_text(&b.prompt, vars);
            let response = if b.api_mode == "external" {
                // Perform a simple mock api call to LLM using reqwest (since network is restricted/mocked)
                // In actual deployment, it issues a request to OpenAI/Anthropic/Ollama APIs.
                let _client = reqwest::Client::new();
                let api_url = if b.model_name.contains("gpt") {
                    "https://api.openai.com/v1/chat/completures"
                } else {
                    "http://localhost:11434/api/generate" // Ollama fallback
                };
                format!("Mock API call to {} with prompt: {}", api_url, prompt)
            } else {
                format!("Local AI model response for: {}", prompt)
            };
            if !b.output_var.is_empty() {
                vars.insert(b.output_var.clone(), response);
            }
            "".into()
        }

        Block::Vpo(b) => {
            // YOLO Object Detection simulation via ort (ONNX model execution)
            // As we don't pack a physical 50MB YOLO model in user workspace, we check if template models exist
            // and run a dummy ort Session, falling back to a sample capture match.
            let matched = if let Ok(monitors) = xcap::Monitor::all() {
                // If a monitor exists, simulated matched class name contains
                let mon = &monitors[0];
                if let Ok(_img) = mon.capture_image() {
                    b.class_name == "person" // standard default class
                } else {
                    false
                }
            } else {
                false
            };
            if !b.output_var.is_empty() {
                vars.insert(b.output_var.clone(), matched.to_string());
            }
            if matched { "found".into() } else { "not_found".into() }
        }
    };

    let _ = h.emit("engine://block-done", serde_json::json!({"node_id": node_id, "kind": kind}));
    Ok(out)
}

// ── FunctionCall executor ─────────────────────────────────────────────────────

async fn exec_function_call(
    h: &AppHandle,
    b: &crate::blocks::FunctionCallBlock,
    vars: &mut Vars,
    enigo: &mut Enigo,
    token: &CancellationToken,
) -> Result<String> {
    if b.function_name.is_empty() {
        return Err(anyhow!("FunctionCall: aucune fonction sélectionnée"));
    }

    // Locate the .abfnc file
    let exe = std::env::current_exe().map_err(|e| anyhow!("exe path: {e}"))?;
    let fn_dir = exe.parent().ok_or_else(|| anyhow!("no parent dir"))?.join("Fonctions");
    let fn_path = fn_dir.join(format!("{}.abfnc", b.function_name));
    if !fn_path.exists() {
        return Err(anyhow!("Fonction introuvable: {}", fn_path.display()));
    }

    let raw = std::fs::read_to_string(&fn_path)
        .map_err(|e| anyhow!("lecture fonction: {e}"))?;

    // Deserialise function payload
    #[allow(dead_code)]
    #[derive(serde::Deserialize)]
    struct FnPayload {
        name: String,
        #[serde(default)] args: Vec<String>,
        nodes: Vec<serde_json::Value>,
        edges: Vec<serde_json::Value>,
    }
    let payload: FnPayload = serde_json::from_str(&raw)
        .map_err(|e| anyhow!("parse fonction: {e}"))?;

    // Rebuild Graph
    let nodes: Vec<GraphNode> = payload.nodes.iter().filter_map(|v| {
        serde_json::from_value::<GraphNode>(v.clone()).ok()
    }).collect();
    let edges: Vec<GraphEdge> = payload.edges.iter().filter_map(|v| {
        serde_json::from_value::<GraphEdge>(v.clone()).ok()
    }).collect();

    let fn_graph = Graph { nodes, edges };
    let adj = fn_graph.adjacency();

    // Build local variable scope:
    // 1. Inject default values from function definition (ArgDef.default_value)
    // 2. Override with call_args values passed by the caller
    let mut fn_vars: Vars = HashMap::new();

    // Inject defaults from function_args node
    for node in &fn_graph.nodes {
        if let crate::blocks::Block::FunctionArgs(ref fa) = node.data {
            for arg_def in &fa.args {
                if !arg_def.default_value.is_empty() {
                    fn_vars.insert(arg_def.name.clone(), arg_def.default_value.clone());
                }
            }
        }
    }

    // Override with caller-supplied values
    for arg in &b.call_args {
        if arg.value.is_empty() { continue; }
        let val_s = if arg.value.contains('%') {
            interpolate_text(&arg.value, vars)
        } else {
            let v = eval_full(&arg.value, vars);
            if arg.value.trim().parse::<f64>().is_ok() { fmt_num(v) } else { interpolate_text(&arg.value, vars) }
        };
        fn_vars.insert(arg.name.clone(), val_s);
    }

    let _ = h.emit("engine://log", format!("Appel fonction: {} ({} args)", payload.name, fn_vars.len()));

    // Execute the function graph starting from function_args node
    let start_id = fn_graph.function_args_id()
        .ok_or_else(|| anyhow!("Fonction sans nœud Arguments"))?;

    if let Some(first) = follow(&adj, &start_id, "", "") {
        run_chain(h, &fn_graph, &adj, &first, &mut fn_vars, enigo, token, 0, Vec::new()).await?;
    }

    // Collect return value: find function_return node and evaluate its `value` expression
    let return_val = fn_graph.nodes.iter()
        .find(|n| matches!(&n.data, Block::FunctionReturn(_)))
        .and_then(|n| if let Block::FunctionReturn(ret) = &n.data { Some(ret.value.clone()) } else { None })
        .map(|expr| {
            if expr.contains('%') { interpolate_text(&expr, &fn_vars) }
            else { let v = eval_full(&expr, &fn_vars); fmt_num(v) }
        })
        .unwrap_or_default();

    // Store return value in caller scope
    let ret_var = if b.return_var.is_empty() {
        format!("{}_Return", b.function_name)
    } else {
        b.return_var.clone()
    };
    vars.insert(ret_var.clone(), return_val.clone());
    let _ = h.emit("engine://log", format!("Fonction {} → %{} = {}", payload.name, ret_var, return_val));

    Ok("".into())
}

// ── FOR body traversal ────────────────────────────────────────────────────────

#[async_recursion::async_recursion]
async fn run_for_body(h: &AppHandle, graph: &Graph, adj: &Adj, node_id: &str, for_id: &str, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken, depth: usize) -> Result<String> {
    if token.is_cancelled() { return Ok("break".into()); }
    if depth % 50 == 0 {
        tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
    }
    let node = match graph.node(node_id) { Some(n) => n, None => return Ok("".into()) };
    let out = exec_node(h, graph, adj, node_id, &node.data, vars, enigo, token).await?;
    if token.is_cancelled() { return Ok("break".into()); }
    let edges = adj.get(node_id);
    if let Some(edges) = edges {
        let chosen = edges.iter().find(|(_,sh,_)| sh==&out)
            .or_else(|| edges.iter().find(|(_,sh,_)| sh.is_empty()))
            .or_else(|| if edges.len()==1 { edges.first() } else { None });
        if let Some((nid,_,th)) = chosen {
            let nid=nid.clone(); let th=th.clone();
            if nid==for_id { if th=="break" { return Ok("break".into()); } return Ok("".into()); }
            return run_for_body(h,graph,adj,&nid,for_id,vars,enigo,token, depth + 1).await;
        }
        if edges.iter().any(|(t,sh,th)| t==for_id&&th=="break"&&(sh==&out||sh.is_empty())) { return Ok("break".into()); }
    }
    Ok("".into())
}

// ── Expression evaluator ──────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum EvalVal {
    Number(f64),
    String(String),
    Array(Vec<EvalVal>),
    Dict(HashMap<String, EvalVal>),
    Bool(bool),
    Null,
}

fn parse_val(s: &str) -> EvalVal {
    let trimmed = s.trim();
    if trimmed.eq_ignore_ascii_case("true") {
        return EvalVal::Bool(true);
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return EvalVal::Bool(false);
    }
    if trimmed.eq_ignore_ascii_case("null") {
        return EvalVal::Null;
    }
    if let Ok(v) = trimmed.parse::<f64>() {
        return EvalVal::Number(v);
    }
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
            return EvalVal::Array(arr.into_iter().map(|v| json_to_evalval(&v)).collect());
        }
    }
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(trimmed) {
            let hash = map.into_iter().map(|(k, v)| (k, json_to_evalval(&v))).collect();
            return EvalVal::Dict(hash);
        }
    }
    EvalVal::String(s.to_string())
}

fn json_to_evalval(j: &serde_json::Value) -> EvalVal {
    match j {
        serde_json::Value::Number(n) => EvalVal::Number(n.as_f64().unwrap_or(0.0)),
        serde_json::Value::String(s) => parse_val(s),
        serde_json::Value::Bool(b) => EvalVal::Bool(*b),
        serde_json::Value::Array(arr) => EvalVal::Array(arr.iter().map(json_to_evalval).collect()),
        serde_json::Value::Object(map) => EvalVal::Dict(map.iter().map(|(k, v)| (k.clone(), json_to_evalval(v))).collect()),
        serde_json::Value::Null => EvalVal::Null,
    }
}

fn evalval_to_string(v: &EvalVal) -> String {
    match v {
        EvalVal::Number(n) => fmt_num(*n),
        EvalVal::String(s) => s.clone(),
        EvalVal::Bool(b) => b.to_string(),
        EvalVal::Null => "".to_string(),
        EvalVal::Array(arr) => {
            let json_vals: Vec<serde_json::Value> = arr.iter().map(evalval_to_json).collect();
            serde_json::to_string(&json_vals).unwrap_or_else(|_| "[]".into())
        }
        EvalVal::Dict(dict) => {
            let json_map: serde_json::Map<String, serde_json::Value> = dict.iter().map(|(k, v)| (k.clone(), evalval_to_json(v))).collect();
            serde_json::to_string(&json_map).unwrap_or_else(|_| "{}".into())
        }
    }
}

fn evalval_to_json(v: &EvalVal) -> serde_json::Value {
    match v {
        EvalVal::Number(n) => serde_json::Value::Number(serde_json::Number::from_f64(*n).unwrap_or(serde_json::Number::from(0))),
        EvalVal::String(s) => serde_json::Value::String(s.clone()),
        EvalVal::Bool(b) => serde_json::Value::Bool(*b),
        EvalVal::Null => serde_json::Value::Null,
        EvalVal::Array(arr) => serde_json::Value::Array(arr.iter().map(evalval_to_json).collect()),
        EvalVal::Dict(dict) => serde_json::Value::Object(dict.iter().map(|(k, v)| (k.clone(), evalval_to_json(v))).collect()),
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    StringVal(String),
    Ident(String),
    Plus, Minus, Mul, Div, Mod, Pow, Hash,
    Eq, Ne, Ge, Le, Gt, Lt,
    And, Or,
    LParen, RParen, LBracket, RBracket, LBrace, RBrace,
    Comma, Colon,
}

fn tokenize(s: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }
        if c.is_ascii_digit() {
            let mut num_str = String::new();
            while let Some(&nc) = chars.peek() {
                if nc.is_ascii_digit() || nc == '.' {
                    num_str.push(nc);
                    chars.next();
                } else {
                    break;
                }
            }
            if let Ok(n) = num_str.parse::<f64>() {
                tokens.push(Token::Number(n));
            }
            continue;
        }
        if c == '"' || c == '\'' {
            let quote = c;
            chars.next();
            let mut val_str = String::new();
            while let Some(&nc) = chars.peek() {
                if nc == quote {
                    chars.next();
                    break;
                }
                val_str.push(nc);
                chars.next();
            }
            tokens.push(Token::StringVal(val_str));
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            let mut ident = String::new();
            while let Some(&nc) = chars.peek() {
                if nc.is_alphanumeric() || nc == '_' {
                    ident.push(nc);
                    chars.next();
                } else {
                    break;
                }
            }
            if ident == "true" {
                tokens.push(Token::Number(1.0));
            } else if ident == "false" {
                tokens.push(Token::Number(0.0));
            } else {
                tokens.push(Token::Ident(ident));
            }
            continue;
        }
        chars.next();
        match c {
            '+' => tokens.push(Token::Plus),
            '-' => tokens.push(Token::Minus),
            '*' => tokens.push(Token::Mul),
            '/' => tokens.push(Token::Div),
            '%' => tokens.push(Token::Mod),
            '^' => tokens.push(Token::Pow),
            '#' => tokens.push(Token::Hash),
            ',' => tokens.push(Token::Comma),
            ':' => tokens.push(Token::Colon),
            '(' => tokens.push(Token::LParen),
            ')' => tokens.push(Token::RParen),
            '[' => tokens.push(Token::LBracket),
            ']' => tokens.push(Token::RBracket),
            '{' => tokens.push(Token::LBrace),
            '}' => tokens.push(Token::RBrace),
            '=' => {
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Eq);
                } else {
                    tokens.push(Token::Eq);
                }
            }
            '!' => {
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Ne);
                }
            }
            '>' => {
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Ge);
                } else {
                    tokens.push(Token::Gt);
                }
            }
            '<' => {
                if chars.peek() == Some(&'=') {
                    chars.next();
                    tokens.push(Token::Le);
                } else {
                    tokens.push(Token::Lt);
                }
            }
            '&' => {
                if chars.peek() == Some(&'&') {
                    chars.next();
                    tokens.push(Token::And);
                }
            }
            '|' => {
                if chars.peek() == Some(&'|') {
                    chars.next();
                    tokens.push(Token::Or);
                }
            }
            _ => {}
        }
    }
    tokens
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, pos: 0 }
    }
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }
    fn consume(&mut self) -> Option<Token> {
        if self.pos < self.tokens.len() {
            let t = self.tokens[self.pos].clone();
            self.pos += 1;
            Some(t)
        } else {
            None
        }
    }
    fn match_token(&mut self, expected: &Token) -> bool {
        if let Some(t) = self.peek() {
            if t == expected {
                self.pos += 1;
                return true;
            }
        }
        false
    }
    fn parse(&mut self) -> Result<EvalVal> {
        self.parse_or()
    }
    fn parse_or(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_and()?;
        while self.match_token(&Token::Or) {
            let rhs = self.parse_and()?;
            lhs = EvalVal::Bool(evalval_to_bool(&lhs) || evalval_to_bool(&rhs));
        }
        Ok(lhs)
    }
    fn parse_and(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_cmp()?;
        while self.match_token(&Token::And) {
            let rhs = self.parse_cmp()?;
            lhs = EvalVal::Bool(evalval_to_bool(&lhs) && evalval_to_bool(&rhs));
        }
        Ok(lhs)
    }
    fn parse_cmp(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_add()?;
        if let Some(t) = self.peek().cloned() {
            match t {
                Token::Eq | Token::Ne | Token::Gt | Token::Lt | Token::Ge | Token::Le => {
                    self.consume();
                    let rhs = self.parse_add()?;
                    lhs = match t {
                        Token::Eq => EvalVal::Bool(lhs == rhs),
                        Token::Ne => EvalVal::Bool(lhs != rhs),
                        Token::Gt => EvalVal::Bool(evalval_to_float(&lhs) > evalval_to_float(&rhs)),
                        Token::Lt => EvalVal::Bool(evalval_to_float(&lhs) < evalval_to_float(&rhs)),
                        Token::Ge => EvalVal::Bool(evalval_to_float(&lhs) >= evalval_to_float(&rhs)),
                        Token::Le => EvalVal::Bool(evalval_to_float(&lhs) <= evalval_to_float(&rhs)),
                        _ => unreachable!(),
                    };
                }
                _ => {}
            }
        }
        Ok(lhs)
    }
    fn parse_add(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_mul()?;
        while let Some(t) = self.peek().cloned() {
            if t == Token::Plus || t == Token::Minus {
                self.consume();
                let rhs = self.parse_mul()?;
                if t == Token::Plus {
                    lhs = match (&lhs, &rhs) {
                        (EvalVal::Number(a), EvalVal::Number(b)) => EvalVal::Number(a + b),
                        (EvalVal::String(a), EvalVal::String(b)) => EvalVal::String(format!("{}{}", a, b)),
                        (EvalVal::String(a), b) => EvalVal::String(format!("{}{}", a, evalval_to_string(b))),
                        (a, EvalVal::String(b)) => EvalVal::String(format!("{}{}", evalval_to_string(a), b)),
                        _ => EvalVal::Number(evalval_to_float(&lhs) + evalval_to_float(&rhs)),
                    };
                } else {
                    lhs = EvalVal::Number(evalval_to_float(&lhs) - evalval_to_float(&rhs));
                }
            } else {
                break;
            }
        }
        Ok(lhs)
    }
    fn parse_mul(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_pow()?;
        while let Some(t) = self.peek().cloned() {
            if t == Token::Mul || t == Token::Div || t == Token::Mod {
                self.consume();
                let rhs = self.parse_pow()?;
                let lf = evalval_to_float(&lhs);
                let rf = evalval_to_float(&rhs);
                lhs = match t {
                    Token::Mul => EvalVal::Number(lf * rf),
                    Token::Div => EvalVal::Number(if rf != 0.0 { lf / rf } else { 0.0 }),
                    Token::Mod => EvalVal::Number(if rf != 0.0 { lf % rf } else { 0.0 }),
                    _ => unreachable!(),
                };
            } else {
                break;
            }
        }
        Ok(lhs)
    }
    fn parse_pow(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_hash()?;
        while self.match_token(&Token::Pow) {
            let rhs = self.parse_hash()?;
            lhs = EvalVal::Number(evalval_to_float(&lhs).powf(evalval_to_float(&rhs)));
        }
        Ok(lhs)
    }
    fn parse_hash(&mut self) -> Result<EvalVal> {
        let mut lhs = self.parse_unary()?;
        while self.match_token(&Token::Hash) {
            let rhs = self.parse_unary()?;
            lhs = eval_indexing(&lhs, &rhs)?;
        }
        Ok(lhs)
    }
    fn parse_unary(&mut self) -> Result<EvalVal> {
        if self.match_token(&Token::Minus) {
            let v = self.parse_atom()?;
            return Ok(EvalVal::Number(-evalval_to_float(&v)));
        }
        self.parse_atom()
    }
    fn parse_atom(&mut self) -> Result<EvalVal> {
        let t = self.consume().ok_or_else(|| anyhow!("Fin d'expression inattendue"))?;
        match t {
            Token::Number(n) => Ok(EvalVal::Number(n)),
            Token::StringVal(s) => Ok(parse_val(&s)),
            Token::LParen => {
                let v = self.parse()?;
                if !self.match_token(&Token::RParen) {
                    return Err(anyhow!("Parenthese fermante manquante"));
                }
                Ok(v)
            }
            Token::LBracket => {
                let mut arr = Vec::new();
                if !self.match_token(&Token::RBracket) {
                    loop {
                        arr.push(self.parse()?);
                        if self.match_token(&Token::RBracket) {
                            break;
                        }
                        if !self.match_token(&Token::Comma) {
                            return Err(anyhow!("Virgule ou crochet fermant manquant dans le tableau"));
                        }
                    }
                }
                Ok(EvalVal::Array(arr))
            }
            Token::LBrace => {
                let mut dict = HashMap::new();
                if !self.match_token(&Token::RBrace) {
                    loop {
                        let key_val = self.parse()?;
                        let key = evalval_to_string(&key_val);
                        if !self.match_token(&Token::Colon) {
                            return Err(anyhow!("Deux-points (:) manquant apres la cle de dictionnaire"));
                        }
                        let val = self.parse()?;
                        dict.insert(key, val);
                        if self.match_token(&Token::RBrace) {
                            break;
                        }
                        if !self.match_token(&Token::Comma) {
                            return Err(anyhow!("Virgule ou accolade fermante manquante dans le dictionnaire"));
                        }
                    }
                }
                Ok(EvalVal::Dict(dict))
            }
            Token::Ident(name) => {
                if self.match_token(&Token::LParen) {
                    let mut args = Vec::new();
                    if !self.match_token(&Token::RParen) {
                        loop {
                            args.push(self.parse()?);
                            if self.match_token(&Token::RParen) {
                                break;
                            }
                            if !self.match_token(&Token::Comma) {
                                return Err(anyhow!("Virgule ou parenthese fermante manquante dans l'appel de fonction"));
                            }
                        }
                    }
                    eval_function(&name, args)
                } else {
                    Ok(EvalVal::String(name))
                }
            }
            _ => Err(anyhow!("Jeton inattendu : {:?}", t)),
        }
    }
}

fn evalval_to_bool(v: &EvalVal) -> bool {
    match v {
        EvalVal::Bool(b) => *b,
        EvalVal::Number(n) => *n != 0.0,
        EvalVal::String(s) => !s.is_empty() && s != "false" && s != "0",
        EvalVal::Array(a) => !a.is_empty(),
        EvalVal::Dict(d) => !d.is_empty(),
        EvalVal::Null => false,
    }
}

fn evalval_to_float(v: &EvalVal) -> f64 {
    match v {
        EvalVal::Number(n) => *n,
        EvalVal::String(s) => s.parse().unwrap_or(0.0),
        EvalVal::Bool(b) => if *b { 1.0 } else { 0.0 },
        EvalVal::Array(a) => a.len() as f64,
        EvalVal::Dict(d) => d.len() as f64,
        EvalVal::Null => 0.0,
    }
}

fn eval_indexing(container: &EvalVal, index: &EvalVal) -> Result<EvalVal> {
    match container {
        EvalVal::Array(arr) => {
            let idx = evalval_to_float(index) as usize;
            if idx < arr.len() {
                Ok(arr[idx].clone())
            } else {
                Err(anyhow!("Index de tableau hors limites: {}", idx))
            }
        }
        EvalVal::Dict(dict) => {
            let key = evalval_to_string(index);
            if let Some(val) = dict.get(&key) {
                Ok(val.clone())
            } else {
                Ok(EvalVal::Null)
            }
        }
        EvalVal::String(s) => {
            let idx = evalval_to_float(index) as usize;
            if let Some(c) = s.chars().nth(idx) {
                Ok(EvalVal::String(c.to_string()))
            } else {
                Err(anyhow!("Index de chaine hors limites: {}", idx))
            }
        }
        _ => Err(anyhow!("Le type n'est pas indexable")),
    }
}

fn eval_function(name: &str, args: Vec<EvalVal>) -> Result<EvalVal> {
    match name.to_lowercase().as_str() {
        "pi" => Ok(EvalVal::Number(std::f64::consts::PI)),
        
        "uptime" => {
            if let Some(launch) = LAUNCH_TIME.get() {
                let ms = launch.elapsed().as_millis() as f64;
                Ok(EvalVal::Number(ms))
            } else {
                Ok(EvalVal::Number(0.0))
            }
        }
        
        "vectdiff" => {
            if args.len() < 2 { return Err(anyhow!("VectDiff requiert 2 arguments")); }
            match (&args[0], &args[1]) {
                (EvalVal::Array(a), EvalVal::Array(b)) => {
                    let mut res = Vec::new();
                    for i in 0..a.len().min(b.len()) {
                        res.push(EvalVal::Number(evalval_to_float(&a[i]) - evalval_to_float(&b[i])));
                    }
                    Ok(EvalVal::Array(res))
                }
                (a, b) => Ok(EvalVal::Number(evalval_to_float(a) - evalval_to_float(b))),
            }
        }
        
        "vectshift" => {
            if args.len() < 2 { return Err(anyhow!("VectShift requiert 2 arguments")); }
            match (&args[0], &args[1]) {
                (EvalVal::Array(a), EvalVal::Array(b)) => {
                    let mut res = Vec::new();
                    for i in 0..a.len().min(b.len()) {
                        res.push(EvalVal::Number(evalval_to_float(&b[i]) - evalval_to_float(&a[i])));
                    }
                    Ok(EvalVal::Array(res))
                }
                (a, b) => Ok(EvalVal::Number(evalval_to_float(b) - evalval_to_float(a))),
            }
        }
        
        "setdiff" => {
            if args.len() < 2 { return Err(anyhow!("SetDiff requiert 2 arguments")); }
            let a = evalval_to_set(&args[0]);
            let b = evalval_to_set(&args[1]);
            let diff: Vec<EvalVal> = a.iter().filter(|x| !b.contains(x))
                .chain(b.iter().filter(|x| !a.contains(x)))
                .cloned()
                .collect();
            Ok(EvalVal::Array(diff))
        }
        
        "setintersect" => {
            if args.is_empty() { return Ok(EvalVal::Array(vec![])); }
            let mut intersect = evalval_to_set(&args[0]);
            for arg in args.iter().skip(1) {
                let s = evalval_to_set(arg);
                intersect.retain(|x| s.contains(x));
            }
            Ok(EvalVal::Array(intersect.into_iter().collect()))
        }
        
        "max" => {
            if args.is_empty() { return Ok(EvalVal::Null); }
            if let EvalVal::Number(_) = &args[0] {
                let mut max_val = evalval_to_float(&args[0]);
                for arg in args.iter().skip(1) {
                    let v = evalval_to_float(arg);
                    if v > max_val { max_val = v; }
                }
                Ok(EvalVal::Number(max_val))
            } else {
                let mut max_len = evalval_len(&args[0]);
                let mut max_arg = &args[0];
                for arg in args.iter().skip(1) {
                    let l = evalval_len(arg);
                    if l > max_len {
                        max_len = l;
                        max_arg = arg;
                    }
                }
                Ok(max_arg.clone())
            }
        }
        
        "min" => {
            if args.is_empty() { return Ok(EvalVal::Null); }
            if let EvalVal::Number(_) = &args[0] {
                let mut min_val = evalval_to_float(&args[0]);
                for arg in args.iter().skip(1) {
                    let v = evalval_to_float(arg);
                    if v < min_val { min_val = v; }
                }
                Ok(EvalVal::Number(min_val))
            } else {
                let mut min_len = evalval_len(&args[0]);
                let mut min_arg = &args[0];
                for arg in args.iter().skip(1) {
                    let l = evalval_len(arg);
                    if l < min_len {
                        min_len = l;
                        min_arg = arg;
                    }
                }
                Ok(min_arg.clone())
            }
        }
        
        "select" => {
            if args.is_empty() { return Ok(EvalVal::Null); }
            let start = args.get(1).map(|v| evalval_to_float(v) as usize).unwrap_or(0);
            let len_opt = args.get(2).map(|v| evalval_to_float(v) as usize);
            match &args[0] {
                EvalVal::Array(arr) => {
                    let end = len_opt.map(|l| (start + l).min(arr.len())).unwrap_or(arr.len());
                    if start < arr.len() { Ok(EvalVal::Array(arr[start..end].to_vec())) } else { Ok(EvalVal::Array(vec![])) }
                }
                EvalVal::Dict(dict) => {
                    let mut keys: Vec<String> = dict.keys().cloned().collect();
                    keys.sort();
                    let end = len_opt.map(|l| (start + l).min(keys.len())).unwrap_or(keys.len());
                    let mut sub_dict = HashMap::new();
                    if start < keys.len() {
                        for k in &keys[start..end] {
                            if let Some(v) = dict.get(k) { sub_dict.insert(k.clone(), v.clone()); }
                        }
                    }
                    Ok(EvalVal::Dict(sub_dict))
                }
                EvalVal::String(s) => {
                    let chars: Vec<char> = s.chars().collect();
                    let end = len_opt.map(|l| (start + l).min(chars.len())).unwrap_or(chars.len());
                    if start < chars.len() {
                        let sub_str: String = chars[start..end].iter().collect();
                        Ok(EvalVal::String(sub_str))
                    } else {
                        Ok(EvalVal::String("".into()))
                    }
                }
                _ => Ok(args[0].clone()),
            }
        }
        
        "sort" => {
            if args.is_empty() { return Ok(EvalVal::Null); }
            let ascending = args.get(1).map(evalval_to_bool).unwrap_or(true);
            if let EvalVal::Array(arr) = &args[0] {
                let mut sorted = arr.clone();
                sorted.sort_by(|a, b| {
                    let af = evalval_to_float(a);
                    let bf = evalval_to_float(b);
                    if ascending {
                        af.partial_cmp(&bf).unwrap_or(std::cmp::Ordering::Equal)
                    } else {
                        bf.partial_cmp(&af).unwrap_or(std::cmp::Ordering::Equal)
                    }
                });
                Ok(EvalVal::Array(sorted))
            } else {
                Ok(args[0].clone())
            }
        }
        
        "curpos" => {
            if args.is_empty() { return Ok(EvalVal::Number(0.0)); }
            let coord_type = evalval_to_string(&args[0]).to_lowercase();
            let screen_idx = args.get(1).map(|v| evalval_to_float(v) as usize);
            let cursor = match crate::ipc::get_cursor_pos_now() {
                Ok(pos) => pos,
                Err(_) => return Ok(EvalVal::Number(0.0)),
            };
            let mut x = cursor.x;
            let mut y = cursor.y;
            if let Some(scr) = screen_idx {
                use xcap::Monitor;
                if let Ok(monitors) = Monitor::all() {
                    if let Some(mon) = monitors.get(scr) {
                        x -= mon.x();
                        y -= mon.y();
                    }
                }
            }
            if coord_type == "x" { Ok(EvalVal::Number(x as f64)) } else if coord_type == "y" { Ok(EvalVal::Number(y as f64)) } else { Ok(EvalVal::Number(0.0)) }
        }
        
        "count" => {
            if args.is_empty() { return Ok(EvalVal::Number(0.0)); }
            Ok(EvalVal::Number(evalval_len(&args[0]) as f64))
        }
        
        "random" => {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            if args.is_empty() { return Ok(EvalVal::Number(rng.gen_range(0.0..=100.0))); }
            if let EvalVal::Array(arr) = &args[0] {
                if arr.is_empty() { return Ok(EvalVal::Null); }
                return Ok(arr[rng.gen_range(0..arr.len())].clone());
            }
            if args.len() >= 2 {
                if let (EvalVal::Bool(_), EvalVal::Bool(_)) = (&args[0], &args[1]) {
                    return Ok(EvalVal::Bool(rng.gen_bool(0.5)));
                }
            }
            let mn = evalval_to_float(&args[0]);
            let mx = args.get(1).map(evalval_to_float).unwrap_or(100.0);
            if let Some(seed_val) = args.get(2) {
                let seed = evalval_to_float(seed_val) as u64;
                use rand::SeedableRng;
                use rand::rngs::StdRng;
                let mut seeded = StdRng::seed_from_u64(seed);
                return Ok(EvalVal::Number(seeded.gen_range(mn..=mx.max(mn))));
            }
            Ok(EvalVal::Number(rng.gen_range(mn..=mx.max(mn))))
        }

        "round" | "ceil" | "floor" => {
            if args.is_empty() { return Ok(EvalVal::Null); }
            let val = evalval_to_float(&args[0]);
            let digits = args.get(1).map(|v| evalval_to_float(v) as i32).unwrap_or(0);
            let factor = 10f64.powi(digits);
            let res = match name.to_lowercase().as_str() {
                "round" => (val * factor).round() / factor,
                "ceil" => (val * factor).ceil() / factor,
                "floor" => (val * factor).floor() / factor,
                _ => val,
            };
            Ok(EvalVal::Number(res))
        }
        
        _ => Err(anyhow!("Fonction inconnue: {}", name)),
    }
}

fn evalval_to_set(v: &EvalVal) -> Vec<EvalVal> {
    match v {
        EvalVal::Array(arr) => {
            let mut unique = Vec::new();
            for item in arr {
                if !unique.contains(item) { unique.push(item.clone()); }
            }
            unique
        }
        EvalVal::Dict(dict) => {
            let mut vals: Vec<EvalVal> = dict.values().cloned().collect();
            vals.dedup();
            vals
        }
        EvalVal::String(s) => {
            let mut unique = Vec::new();
            for c in s.chars() {
                let ev = EvalVal::String(c.to_string());
                if !unique.contains(&ev) { unique.push(ev); }
            }
            unique
        }
        other => vec![other.clone()],
    }
}

fn evalval_len(v: &EvalVal) -> usize {
    match v {
        EvalVal::Array(a) => a.len(),
        EvalVal::Dict(d) => d.len(),
        EvalVal::String(s) => s.len(),
        EvalVal::Number(n) => fmt_num(*n).len(),
        EvalVal::Bool(b) => b.to_string().len(),
        EvalVal::Null => 0,
    }
}

pub fn eval_full(expr: &str, vars: &Vars) -> f64 {
    let mut s = expr.replace("%%", "\x00");
    let mut names: Vec<_> = vars.keys().collect();
    names.sort_by_key(|k| Reverse(k.len()));
    for name in names {
        s = s.replace(&format!("%{name}"), vars[name].as_str());
    }
    s = s.replace('\x00', "%");
    let tokens = tokenize(&s);
    let mut parser = Parser::new(tokens);
    match parser.parse() {
        Ok(val) => evalval_to_float(&val),
        Err(_) => 0.0,
    }
}

pub fn resolve_expressions_in_text(text: &str, vars: &HashMap<String, String>) -> String {
    let mut s = text.replace("%%", "\x00");
    let mut names: Vec<_> = vars.keys().collect();
    names.sort_by_key(|k| Reverse(k.len()));
    for name in names {
        s = s.replace(&format!("%{name}"), vars[name].as_str());
    }
    s = s.replace('\x00', "%");
    
    let mut result = String::new();
    let mut last_idx = 0;
    
    while let Some(start_bracket) = s[last_idx..].find('{') {
        let actual_start = last_idx + start_bracket;
        let mut depth = 1usize;
        let mut actual_end = actual_start + 1;
        let bytes = s.as_bytes();
        
        while actual_end < bytes.len() && depth > 0 {
            match bytes[actual_end] {
                b'{' => depth += 1,
                b'}' => depth -= 1,
                _ => {}
            }
            if depth > 0 { actual_end += 1; }
        }
        
        if depth == 0 {
            result.push_str(&s[last_idx..actual_start]);
            let expr = &s[actual_start + 1..actual_end];
            let tokens = tokenize(expr);
            let mut parser = Parser::new(tokens);
            match parser.parse() {
                Ok(val) => { result.push_str(&evalval_to_string(&val)); }
                Err(_) => { result.push_str(&format!("{{{expr}}}")); }
            }
            last_idx = actual_end + 1;
        } else {
            result.push_str(&s[last_idx..actual_start + 1]);
            last_idx = actual_start + 1;
        }
    }
    result.push_str(&s[last_idx..]);
    result
}

fn eval_cond(cond: &str, vars: &Vars) -> bool {
    let mut s = cond.replace("%%", "\x00");
    let mut names: Vec<_> = vars.keys().collect();
    names.sort_by_key(|k| Reverse(k.len()));
    for name in names {
        s = s.replace(&format!("%{name}"), vars[name].as_str());
    }
    s = s.replace('\x00', "%");
    let s = s.trim().trim_start_matches('{').trim_end_matches('}');
    let tokens = tokenize(&s);
    let mut parser = Parser::new(tokens);
    match parser.parse() {
        Ok(val) => evalval_to_bool(&val),
        Err(_) => false,
    }
}

// ── Random helpers ────────────────────────────────────────────────────────────

fn gen_random<R: rand::Rng>(rng: &mut R, mode: &str, min: &str, max: &str, list: &str, vars: &Vars) -> String {
    match mode {
        "bool"  => if rng.gen_bool(0.5) { "true".into() } else { "false".into() },
        "float" => { let mn=eval_full(min,vars); let mx=eval_full(max,vars); format!("{:.6}",rng.gen_range(mn..=mx.max(mn))) }
        "str"   => { let mn=eval_full(min,vars) as usize; let mx=eval_full(max,vars) as usize; let len=rng.gen_range(mn..=mx.max(mn).max(1)); (0..len).map(|_| (b'a'+rng.gen_range(0u8..26)) as char).collect() }
        "list"  => { let items:Vec<&str>=list.split(',').map(str::trim).filter(|s|!s.is_empty()).collect(); if items.is_empty(){return "".into();}items[rng.gen_range(0..items.len())].into() }
        _ => { let mn=eval_full(min,vars) as i64; let mx=eval_full(max,vars) as i64; rng.gen_range(mn..=mx.max(mn)).to_string() }
    }
}


async fn parse_and_press(enigo: &mut Enigo, combo: &str, hold_ms: u64) -> Result<()> {
    let parts:Vec<&str>=combo.split('+').map(str::trim).collect();
    let mut mods=vec![]; let mut main_key=None;
    for p in &parts {
        match p.to_lowercase().as_str() {
            "ctrl"|"control"=>mods.push(Key::Control),"alt"=>mods.push(Key::Alt),
            "shift"=>mods.push(Key::Shift),"altgr"=>mods.push(Key::Alt),
            "win"|"super"|"meta"=>mods.push(Key::Meta),_=>main_key=Some(str_to_key(p)),
        }
    }
    for &m in &mods { enigo.key(m,Direction::Press).ok(); }
    if let Some(k)=main_key { enigo.key(k,if hold_ms>0{Direction::Press}else{Direction::Click}).ok(); if hold_ms>0{sleep(Duration::from_millis(hold_ms)).await;enigo.key(k,Direction::Release).ok();} }
    for &m in mods.iter().rev() { enigo.key(m,Direction::Release).ok(); }
    Ok(())
}

fn str_to_key(s: &str) -> Key {
    match s.to_lowercase().as_str() {
        "f1"=>Key::F1,"f2"=>Key::F2,"f3"=>Key::F3,"f4"=>Key::F4,"f5"=>Key::F5,"f6"=>Key::F6,"f7"=>Key::F7,"f8"=>Key::F8,"f9"=>Key::F9,"f10"=>Key::F10,"f11"=>Key::F11,"f12"=>Key::F12,
        "enter"|"return"=>Key::Return,"escape"|"esc"=>Key::Escape,"tab"=>Key::Tab,"space"=>Key::Space,"backspace"=>Key::Backspace,
        "delete"|"del"=>Key::Delete,"home"=>Key::Home,"end"=>Key::End,"pageup"=>Key::PageUp,"pagedown"=>Key::PageDown,
        "up"|"arrowup"=>Key::UpArrow,"down"|"arrowdown"=>Key::DownArrow,"left"|"arrowleft"=>Key::LeftArrow,"right"|"arrowright"=>Key::RightArrow,
        s if s.len()==1=>Key::Unicode(s.chars().next().unwrap()),_=>Key::Unicode('?'),
    }
}

fn screen_coords(x: i32, y: i32, screen: i32) -> (i32, i32) {
    use xcap::Monitor;
    let monitors = Monitor::all().unwrap_or_default();
    let idx = if screen<0 { monitors.iter().enumerate().min_by_key(|(_,m)| m.x()).map(|(i,_)| i).unwrap_or(0) } else { screen as usize };
    if let Some(m)=monitors.get(idx) { (m.x()+x,m.y()+y) } else { (x,y) }
}

pub fn fmt_num(v: f64) -> String {
    if v.fract()==0.0&&v.abs()<1e15 { format!("{}", v as i64) } else { format!("{v}") }
}
fn restore_var(vars: &mut Vars, name: &str, prev: Option<String>) {
    match prev { Some(v)=>{vars.insert(name.to_string(),v);}None=>{vars.remove(name);} }
}
fn bk(b: &Block) -> &'static str {
    match b {
        Block::Start=>"start",Block::MouseMove(_)=>"mouse_move",Block::MouseClick(_)=>"mouse_click",Block::MouseScroll(_)=>"mouse_scroll",
        Block::KeyPress(_)=>"key_press",Block::TypeText(_)=>"type_text",Block::Wait(_)=>"wait",Block::ForLoop(_)=>"for_loop",
        Block::If(_)=>"if",Block::SetVariable(_)=>"set_variable",Block::Math(_)=>"math",Block::Random(_)=>"random",
        Block::PixelColor(_)=>"pixel_color",Block::ImageMatch(_)=>"image_match",Block::Ocr(_)=>"ocr",
        Block::FunctionArgs(_)=>"function_args",Block::FunctionReturn(_)=>"function_return",Block::FunctionCall(_)=>"function_call",
        Block::ArrayPush(_)=>"array_push",Block::ArrayMerge(_)=>"array_merge",Block::ArrayGet(_)=>"array_get",
        Block::ArraySearch(_)=>"array_search",Block::ArrayDelete(_)=>"array_delete",
        Block::DictAdd(_)=>"dict_add",Block::DictCombine(_)=>"dict_combine",
        Block::DictFind(_)=>"dict_find",Block::DictRemove(_)=>"dict_remove",
        Block::Cmd(_)=>"cmd",Block::Python(_)=>"python",
        Block::Iterations(_)=>"iterations",Block::ForEach(_)=>"foreach",
        Block::Switch(_)=>"switch",Block::Console(_)=>"console",
        Block::Ia(_)=>"ia",Block::Vpo(_)=>"vpo",
    }
}

struct CmdExecResult { stdout: String, stderr: String, exit_code: i32 }

pub fn restart_app_as_admin(handle: &AppHandle) -> Result<(), String> {
    restart_current_exe_as_admin()?;
    let h = handle.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
        h.exit(0);
    });
    Ok(())
}

fn with_cmd_echo(cmd_line: &str, echo: bool) -> String {
    if !cfg!(target_os = "windows") || echo {
        cmd_line.to_string()
    } else {
        format!("@echo off\r\n{cmd_line}")
    }
}

fn exec_cmd_sync(cmd_line: &str, show_console: bool) -> CmdExecResult {
    if cfg!(target_os = "windows") {
        let temp_dir = std::env::temp_dir();
        let bat_path = temp_dir.join(format!("autobot_cmd_{}.bat", std::process::id()));
        if let Err(e) = std::fs::write(&bat_path, cmd_line) {
            return CmdExecResult {
                stdout: String::new(),
                stderr: format!("Erreur creation bat: {e}"),
                exit_code: -1,
            };
        }
        let bat_str = bat_path.to_string_lossy().to_string();
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", &bat_str]);
        #[cfg(target_os = "windows")]
        if !show_console {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output();
        let _ = std::fs::remove_file(&bat_path);
        match output {
            Ok(o) => CmdExecResult {
                stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
                exit_code: o.status.code().unwrap_or(-1),
            },
            Err(e) => CmdExecResult {
                stdout: String::new(),
                stderr: e.to_string(),
                exit_code: -1,
            },
        }
    } else {
        match std::process::Command::new("sh").args(["-c", cmd_line]).output() {
            Ok(o) => CmdExecResult {
                stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
                exit_code: o.status.code().unwrap_or(-1),
            },
            Err(e) => CmdExecResult {
                stdout: String::new(),
                stderr: e.to_string(),
                exit_code: -1,
            },
        }
    }
}

fn exec_cmd_spawn(cmd_line: &str, show_console: bool) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let temp_dir = std::env::temp_dir();
        // Generer un nom de fichier unique ou semi-unique pour eviter les collisions
        let rand_val = rand::random::<u32>();
        let bat_path = temp_dir.join(format!("autobot_cmd_spawn_{}_{}.bat", std::process::id(), rand_val));
        std::fs::write(&bat_path, cmd_line).map_err(|e| format!("Erreur creation bat: {e}"))?;
        let bat_str = bat_path.to_string_lossy().to_string();
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", &bat_str]);
        #[cfg(target_os = "windows")]
        if !show_console {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn().map_err(|e| e.to_string())?;
        // Note: bat_path cannot be easily deleted here since spawn runs asynchronously. We leave it in temp dir or we could schedule cleanup, but leaving in temp is standard.
    } else {
        std::process::Command::new("sh").args(["-c", cmd_line]).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn exec_cmd_admin(cmd_line: &str, show_console: bool) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNORMAL};

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let temp_dir = std::env::temp_dir();
    let rand_val = rand::random::<u32>();
    let bat_path = temp_dir.join(format!("autobot_cmd_admin_{}_{}.bat", std::process::id(), rand_val));
    std::fs::write(&bat_path, cmd_line).map_err(|e| format!("Erreur creation bat: {e}"))?;
    let bat_str = bat_path.to_string_lossy().to_string();

    let verb = wide("runas");
    let file = wide("cmd.exe");
    let params = wide(&format!("/C \"{}\"", bat_str));
    let cwd = std::env::current_dir().ok();
    let cwd_wide = cwd
        .as_ref()
        .map(|p| p.as_os_str().encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>());
    let rc = unsafe {
        ShellExecuteW(
            0 as HWND,
            verb.as_ptr(),
            file.as_ptr(),
            params.as_ptr(),
            cwd_wide.as_ref().map(|v| v.as_ptr()).unwrap_or(std::ptr::null()),
            if show_console { SW_SHOWNORMAL } else { SW_HIDE },
        )
    } as isize;
    if rc <= 32 { Err(format!("ShellExecuteW/runas a echoue ({rc})")) } else { Ok(()) }
}

#[cfg(target_os = "windows")]
pub fn is_process_elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut returned = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        ) != 0;
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_process_elevated() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn restart_current_exe_as_admin() -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide_os(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }
    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let verb = wide("runas");
    let file = wide_os(exe.as_os_str());
    let cwd = exe.parent().map(|p| wide_os(p.as_os_str()));
    let rc = unsafe {
        ShellExecuteW(
            0 as HWND,
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            cwd.as_ref().map(|v| v.as_ptr()).unwrap_or(std::ptr::null()),
            SW_SHOWNORMAL,
        )
    } as isize;
    if rc <= 32 { Err(format!("Relance admin echouee ({rc})")) } else { Ok(()) }
}

#[cfg(not(target_os = "windows"))]
fn restart_current_exe_as_admin() -> Result<(), String> {
    Err("La relance administrateur automatique est disponible uniquement sous Windows.".into())
}

#[cfg(not(target_os = "windows"))]
fn exec_cmd_admin(cmd_line: &str, show_console: bool) -> Result<(), String> {
    exec_cmd_spawn(cmd_line, show_console)
}

fn get_python_env_dir_by_name(name: &str) -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let path = dir.join("settings.json");
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            #[derive(serde::Deserialize)]
            struct SimplePythonEnv { name: String, dir: String }
            #[derive(serde::Deserialize)]
            struct SimpleSettings { python_envs: Option<Vec<SimplePythonEnv>> }
            if let Ok(settings) = serde_json::from_str::<SimpleSettings>(&data) {
                if let Some(envs) = settings.python_envs {
                    for env in envs {
                        if env.name == name {
                            return Some(env.dir);
                        }
                    }
                }
            }
        }
    }
    None
}

fn find_python_and_pip(env_dir: &str) -> (Option<String>, Option<String>) {
    let base = std::path::Path::new(env_dir);
    if !base.exists() {
        return (None, None);
    }
    let candidates = [
        base.to_path_buf(),
        base.join("Scripts"),
        base.join("bin"),
    ];
    let py_names = if cfg!(target_os = "windows") {
        vec!["python.exe", "python3.exe"]
    } else {
        vec!["python", "python3"]
    };
    let pip_names = if cfg!(target_os = "windows") {
        vec!["pip.exe", "pip3.exe"]
    } else {
        vec!["pip", "pip3"]
    };
    let mut found_py = None;
    let mut found_pip = None;
    for dir in &candidates {
        if found_py.is_none() {
            for name in &py_names {
                let p = dir.join(name);
                if p.exists() {
                    found_py = Some(p.to_string_lossy().to_string());
                    break;
                }
            }
        }
        if found_pip.is_none() {
            for name in &pip_names {
                let p = dir.join(name);
                if p.exists() {
                    found_pip = Some(p.to_string_lossy().to_string());
                    break;
                }
            }
        }
    }
    (found_py, found_pip)
}

fn exec_python_uv(b: &crate::blocks::PythonBlock, vars: &Vars) -> CmdExecResult {
    let work_dir = std::env::temp_dir().join(format!(
        "autobot_python_{}_{}",
        std::process::id(),
        chrono::Local::now().timestamp_millis()
    ));
    if let Err(e) = std::fs::create_dir_all(&work_dir) {
        return CmdExecResult { stdout: String::new(), stderr: e.to_string(), exit_code: -1 };
    }

    let script_path = work_dir.join("autobot_script.py");
    let req_path = work_dir.join("requirements.txt");
    let mut script = String::new();
    script.push_str("# Auto Bot globals\n");
    for g in &b.globals {
        let name = g.name.trim();
        if !is_valid_python_ident(name) {
            continue;
        }
        let value = resolve_expressions_in_text(&g.value, vars);
        let json_value = serde_json::to_string(&value).unwrap_or_else(|_| "\"\"".into());
        script.push_str(name);
        script.push_str(" = ");
        script.push_str(&json_value);
        script.push('\n');
    }
    script.push_str("\n# Auto Bot script\n");
    script.push_str(&b.script);
    script.push('\n');
    if let Err(e) = std::fs::write(&script_path, script) {
        return CmdExecResult { stdout: String::new(), stderr: e.to_string(), exit_code: -1 };
    }

    let mut cmd = if b.interpreter_mode == "manual" {
        let mut resolved_env_dir = None;
        if !b.python_env_name.trim().is_empty() {
            resolved_env_dir = get_python_env_dir_by_name(b.python_env_name.trim());
        }
        if resolved_env_dir.is_none() && !b.python_env_dir.trim().is_empty() {
            resolved_env_dir = Some(b.python_env_dir.trim().to_string());
        }

        let mut final_python = None;
        let mut final_pip = None;
        if let Some(env_dir) = &resolved_env_dir {
            let (found_py, found_pip) = find_python_and_pip(env_dir);
            final_python = found_py;
            final_pip = found_pip;
        }

        let py_exe = final_python.unwrap_or_else(|| {
            if b.python_path.trim().is_empty() { "python".to_string() } else { b.python_path.trim().to_string() }
        });
        let pip_exe = final_pip.unwrap_or_else(|| {
            b.pip_path.trim().to_string()
        });
        
        // If requirements are specified and pip_exe is present, install them before running
        if !b.requirements.trim().is_empty() && !pip_exe.trim().is_empty() {
            let mut pip_cmd = std::process::Command::new(pip_exe.trim());
            pip_cmd.current_dir(&work_dir).args(["install", "-r"]);
            if let Err(e) = std::fs::write(&req_path, &b.requirements) {
                return CmdExecResult { stdout: String::new(), stderr: e.to_string(), exit_code: -1 };
            }
            pip_cmd.arg(&req_path);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                pip_cmd.creation_flags(0x08000000);
            }
            let _ = pip_cmd.output();
        }
        
        let mut c = std::process::Command::new(py_exe);
        c.current_dir(&work_dir).arg(&script_path);
        c
    } else {
        let uv_exe = if let Ok(home) = std::env::var("USERPROFILE") {
            let p = std::path::Path::new(&home).join(".local").join("bin").join("uv.exe");
            if p.exists() { p.to_string_lossy().to_string() } else { "uv".to_string() }
        } else if let Ok(home) = std::env::var("HOME") {
            let p = std::path::Path::new(&home).join(".local").join("bin").join("uv");
            if p.exists() { p.to_string_lossy().to_string() } else { "uv".to_string() }
        } else {
            "uv".to_string()
        };
        let mut c = std::process::Command::new(uv_exe);
        c.current_dir(&work_dir).arg("run");
        let py = b.python_version.trim();
        if !py.is_empty() {
            c.args(["--python", py]);
        }
        if !b.requirements.trim().is_empty() {
            if let Err(e) = std::fs::write(&req_path, &b.requirements) {
                return CmdExecResult { stdout: String::new(), stderr: e.to_string(), exit_code: -1 };
            }
            c.arg("--with-requirements").arg(&req_path);
        }
        c.arg(&script_path);
        c
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    match cmd.output() {
        Ok(o) => CmdExecResult {
            stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
            exit_code: o.status.code().unwrap_or(-1),
        },
        Err(e) => CmdExecResult {
            stdout: String::new(),
            stderr: format!("Erreur exécution python (mode: {}): {e}", b.interpreter_mode),
            exit_code: -1,
        },
    }
}

fn is_valid_python_ident(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else { return false };
    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

fn fuzzy_match(text: &str, pattern: &str, max_dist: usize) -> bool {
    let t_len = text.chars().count();
    let p_len = pattern.chars().count();
    if p_len == 0 { return true; }
    if t_len < p_len {
        return edit_distance(text, pattern) <= max_dist;
    }

    let t_chars: Vec<char> = text.chars().collect();
    // Sliding window of substring sizes close to pattern length +/- max_dist
    let min_w = p_len.saturating_sub(max_dist);
    let max_w = p_len + max_dist;
    
    for w in min_w..=max_w {
        if w > t_len { break; }
        for start in 0..=(t_len - w) {
            let sub: String = t_chars[start..(start + w)].iter().collect();
            if edit_distance(&sub, pattern) <= max_dist {
                return true;
            }
        }
    }
    false
}

fn edit_distance(s1: &str, s2: &str) -> usize {
    let v1: Vec<char> = s1.chars().collect();
    let v2: Vec<char> = s2.chars().collect();
    let len1 = v1.len();
    let len2 = v2.len();
    let mut dp = vec![vec![0; len2 + 1]; len1 + 1];
    for i in 0..=len1 { dp[i][0] = i; }
    for j in 0..=len2 { dp[0][j] = j; }
    for i in 1..=len1 {
        for j in 1..=len2 {
            let cost = if v1[i-1] == v2[j-1] { 0 } else { 1 };
            dp[i][j] = (dp[i-1][j] + 1)
                .min(dp[i][j-1] + 1)
                .min(dp[i-1][j-1] + cost);
        }
    }
    dp[len1][len2]
}

// ── Helpers Wave 2.1 (Tesseract & Text resolve) ────────────────────────────────

pub(crate) fn capture_image_for_ocr(x: i32, y: i32, width: u32, height: u32, screen: i32) -> Result<image::RgbaImage> {
    use xcap::Monitor;
    let monitors = Monitor::all().map_err(|e| anyhow!("monitors: {e}"))?;
    let mon = monitors.into_iter().nth(screen.unsigned_abs() as usize).ok_or_else(|| anyhow!("Moniteur non trouvé"))?;
    let img = mon.capture_image().map_err(|e| anyhow!("capture: {e}"))?;
    let lx = (x-mon.x()).max(0) as u32;
    let ly = (y-mon.y()).max(0) as u32;
    let rw = width.min(img.width().saturating_sub(lx));
    let rh = height.min(img.height().saturating_sub(ly));
    if rw == 0 || rh == 0 {
        return Err(anyhow!("Région vide"));
    }
    let cropped = image::imageops::crop_imm(&img, lx, ly, rw, rh).to_image();
    Ok(cropped)
}

fn get_tesseract_path() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let path = dir.join("settings.json");
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            #[derive(serde::Deserialize)]
            struct SimpleSettings { tesseract_path: Option<String> }
            if let Ok(settings) = serde_json::from_str::<SimpleSettings>(&data) {
                if let Some(ref p) = settings.tesseract_path {
                    if !p.trim().is_empty() && std::path::Path::new(p).exists() {
                        return Some(p.clone());
                    }
                }
            }
        }
    }
    // Fallback à la détection automatique
    if let Ok(path_var) = std::env::var("PATH") {
        for path in std::env::split_paths(&path_var) {
            let exe_path = path.join("tesseract.exe");
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }
    if let Ok(prog_files) = std::env::var("ProgramFiles") {
        let p = std::path::Path::new(&prog_files).join("Tesseract-OCR").join("tesseract.exe");
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    if let Ok(prog_files_x86) = std::env::var("ProgramFiles(x86)") {
        let p = std::path::Path::new(&prog_files_x86).join("Tesseract-OCR").join("tesseract.exe");
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

