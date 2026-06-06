//! Tauri IPC commands — called from the frontend via `invoke()`.

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};
use xcap::Monitor;

use crate::{blocks::Graph, engine::ExecutionEngine};

// ── Sequence control ──────────────────────────────────────────────────────────

#[command]
pub async fn run_sequence(handle: AppHandle, graph: Graph) -> Result<(), String> {
    ExecutionEngine::run(&handle, graph);
    Ok(())
}

#[command]
pub async fn stop_sequence(handle: AppHandle) -> Result<(), String> {
    ExecutionEngine::stop(&handle);
    Ok(())
}

// ── Executable directory (for Fonctions/ folder) ──────────────────────────────

#[command]
pub async fn get_exe_dir() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("No parent dir")?.to_string_lossy().to_string();
    Ok(dir)
}

/// Ensure the Fonctions/ subdirectory exists and return its path.
#[command]
pub async fn get_functions_dir() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("No parent dir")?.join("Fonctions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[command]
pub async fn write_text_file_native(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
}

/// List all .abfnc files in the Fonctions/ directory.
#[command]
pub async fn list_functions() -> Result<Vec<String>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("No parent dir")?.join("Fonctions");
    if !dir.exists() { return Ok(vec![]); }
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut names = vec![];
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("abfnc") {
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    Ok(names)
}

// ── Screen enumeration ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenInfo {
    pub id: u32, pub name: String, pub x: i32, pub y: i32,
    pub width: u32, pub height: u32, pub scale_factor: f32, pub is_primary: bool,
}

#[command]
pub async fn list_screens() -> Result<Vec<ScreenInfo>, String> {
    Monitor::all().map_err(|e| e.to_string()).map(|monitors| {
        monitors.into_iter().map(|m| ScreenInfo {
            id: m.id(), name: m.name().to_owned(), x: m.x(), y: m.y(),
            width: m.width(), height: m.height(), scale_factor: m.scale_factor(), is_primary: m.is_primary(),
        }).collect()
    })
}

// ── Pixel color capture ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct PixelColorResult { pub r:u8, pub g:u8, pub b:u8, pub hex:String, pub matched:bool }

#[command]
pub async fn capture_pixel_color(x:i32, y:i32, screen:i32, expected:u32, tolerance:u8) -> Result<PixelColorResult, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let mon = monitors.into_iter().nth(screen.unsigned_abs() as usize).ok_or("Screen not found")?;
    let img = mon.capture_image().map_err(|e| e.to_string())?;
    let lx = (x-mon.x()).max(0) as u32; let ly = (y-mon.y()).max(0) as u32;
    if lx>=img.width()||ly>=img.height() { return Err("Coordinates out of bounds".into()); }
    let px = img.get_pixel(lx,ly);
    let (r,g,b) = (px[0],px[1],px[2]);
    let matched = sample_pixel_color(x,y,screen,expected,tolerance);
    Ok(PixelColorResult { r, g, b, hex:format!("#{:02X}{:02X}{:02X}",r,g,b), matched })
}

pub fn sample_pixel_color(x:i32, y:i32, screen_idx:i32, expected:u32, tolerance:u8) -> bool {
    let monitors = match Monitor::all() { Ok(m) => m, Err(_) => return false };
    let Some(mon) = monitors.into_iter().nth(screen_idx.unsigned_abs() as usize) else { return false; };
    let Ok(img) = mon.capture_image() else { return false; };
    let lx = (x-mon.x()).max(0) as u32; let ly = (y-mon.y()).max(0) as u32;
    if lx>=img.width()||ly>=img.height() { return false; }
    let px = img.get_pixel(lx,ly);
    let (er,eg,eb) = (((expected>>16)&0xFF) as i16, ((expected>>8)&0xFF) as i16, (expected&0xFF) as i16);
    let t = tolerance as i16;
    (px[0] as i16-er).abs()<=t && (px[1] as i16-eg).abs()<=t && (px[2] as i16-eb).abs()<=t
}

pub fn match_image_region(template_b64:&str, x:i32, y:i32, width:u32, height:u32, screen_idx:i32, threshold:f64, match_mode:&str) -> Result<MatchImageResult,String> {
    use base64::Engine as _;
    if template_b64.trim().is_empty() { return Ok(MatchImageResult::default()); }
    let bytes = base64::engine::general_purpose::STANDARD.decode(template_b64).map_err(|e| e.to_string())?;
    let template = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let mon = monitors.into_iter().nth(screen_idx.unsigned_abs() as usize).ok_or("Screen not found")?;
    let img = mon.capture_image().map_err(|e| e.to_string())?;
    let lx = (x-mon.x()).max(0) as u32; let ly = (y-mon.y()).max(0) as u32;
    if lx>=img.width()||ly>=img.height() { return Ok(MatchImageResult::default()); }
    let rw = width.min(img.width().saturating_sub(lx));
    let rh = height.min(img.height().saturating_sub(ly));
    if template.width()==0||template.height()==0||template.width()>rw||template.height()>rh { return Ok(MatchImageResult::default()); }
    let search = image::imageops::crop_imm(&img,lx,ly,rw,rh).to_image();
    let tw = template.width();
    let th = template.height();
    let needed = threshold.clamp(0.0,1.0);
    let local_boxes = if match_mode == "all" {
        region_find_all_templates(&search, &template, needed)
    } else {
        region_find_first_template(&search, &template, needed)
            .map(|(sx,sy)| vec![(sx,sy)])
            .unwrap_or_default()
    };
    let boxes: Vec<MatchBox> = local_boxes.into_iter().map(|(sx,sy)| MatchBox {
        x: mon.x() + lx as i32 + sx as i32,
        y: mon.y() + ly as i32 + sy as i32,
        l: tw,
        h: th,
    }).collect();
    Ok(MatchImageResult { matched: !boxes.is_empty(), boxes })
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct MatchBox { pub x: i32, pub y: i32, pub l: u32, pub h: u32 }

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct MatchImageResult { pub matched: bool, pub boxes: Vec<MatchBox> }

pub fn match_boxes_to_json(boxes: &[MatchBox], mode: &str) -> String {
    if boxes.is_empty() { return "{}".into(); }
    if mode == "all" {
        let mut map = serde_json::Map::new();
        for (i, b) in boxes.iter().enumerate() {
            let mut inner = serde_json::Map::new();
            inner.insert("X".into(), serde_json::Value::Number(b.x.into()));
            inner.insert("Y".into(), serde_json::Value::Number(b.y.into()));
            inner.insert("L".into(), serde_json::Value::Number(b.l.into()));
            inner.insert("H".into(), serde_json::Value::Number(b.h.into()));
            map.insert(format!("Match_{i}"), serde_json::Value::Object(inner));
        }
        serde_json::to_string(&map).unwrap_or_else(|_| "{}".into())
    } else {
        let b = &boxes[0];
        let mut map = serde_json::Map::new();
        map.insert("X".into(), serde_json::Value::Number(b.x.into()));
        map.insert("Y".into(), serde_json::Value::Number(b.y.into()));
        map.insert("L".into(), serde_json::Value::Number(b.l.into()));
        map.insert("H".into(), serde_json::Value::Number(b.h.into()));
        serde_json::to_string(&map).unwrap_or_else(|_| "{}".into())
    }
}

fn region_find_first_template(search:&image::RgbaImage, template:&image::RgbaImage, threshold:f64) -> Option<(u32,u32)> {
    let (tw,th) = (template.width(),template.height());
    for sy in 0..=search.height().saturating_sub(th) {
        for sx in 0..=search.width().saturating_sub(tw) {
            if template_score_at(search, template, sx, sy) >= threshold { return Some((sx,sy)); }
        }
    }
    None
}

fn region_find_all_templates(search:&image::RgbaImage, template:&image::RgbaImage, threshold:f64) -> Vec<(u32,u32)> {
    let (tw,th) = (template.width(),template.height());
    let mut found = vec![];
    let mut sy = 0;
    while sy <= search.height().saturating_sub(th) {
        let mut sx = 0;
        while sx <= search.width().saturating_sub(tw) {
            if template_score_at(search, template, sx, sy) >= threshold {
                found.push((sx,sy));
                sx += tw.max(1);
            } else {
                sx += 1;
            }
        }
        sy += th.max(1);
    }
    found
}

fn template_score_at(search:&image::RgbaImage, template:&image::RgbaImage, sx:u32, sy:u32) -> f64 {
    let (tw,th) = (template.width(),template.height());
    let mut score=0.0; let mut count=0.0;
    for ty in 0..th { for tx in 0..tw {
        let a=search.get_pixel(sx+tx,sy+ty); let b=template.get_pixel(tx,ty);
        let dr=(a[0]as f64-b[0]as f64).abs(); let dg=(a[1]as f64-b[1]as f64).abs(); let db=(a[2]as f64-b[2]as f64).abs();
        score+=1.0-((dr+dg+db)/(255.0*3.0)); count+=1.0;
    }}
    if count>0.0 { score/count } else { 0.0 }
}

fn region_contains_template(search:&image::RgbaImage, template:&image::RgbaImage, threshold:f64) -> bool {
    region_find_first_template(search, template, threshold).is_some()
}

// ── Region capture (base64 PNG) ───────────────────────────────────────────────

#[command]
pub async fn capture_region(x:i32, y:i32, width:u32, height:u32, screen:i32) -> Result<String,String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let mon = monitors.into_iter().nth(screen.unsigned_abs() as usize).ok_or("Screen not found")?;
    let img = mon.capture_image().map_err(|e| e.to_string())?;
    let lx = (x-mon.x()).max(0) as u32; let ly = (y-mon.y()).max(0) as u32;
    let cropped = image::imageops::crop_imm(&img,lx,ly,width,height).to_image();
    let mut buf = Vec::new();
    cropped.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png).map_err(|e| e.to_string())?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

// ── Cursor position ───────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CursorPos { pub x:i32, pub y:i32 }

#[tauri::command]
pub async fn get_cursor_position() -> Result<CursorPos,String> { get_cursor_pos_now() }

pub fn get_cursor_pos_now() -> Result<CursorPos,String> {
    let enigo = enigo::Enigo::new(&enigo::Settings::default()).map_err(|e| e.to_string())?;
    let (x,y) = enigo::Mouse::location(&enigo).map_err(|e| e.to_string())?;
    Ok(CursorPos { x, y })
}

// ── Region selection IPC ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn submit_region_selection(
    handle:tauri::AppHandle,
    x:i32,
    y:i32,
    w:u32,
    h:u32,
    origin_x: Option<i32>,
    origin_y: Option<i32>,
) -> Result<(),String> {
    use crate::overlay::{OverlayResult, SelectedRegion};
    
    let mut abs_x = x;
    let mut abs_y = y;
    let mut abs_w = w;
    let mut abs_h = h;

    if let (Some(ox), Some(oy)) = (origin_x, origin_y) {
        abs_x = ox;
        abs_y = oy;
        if let Some(win) = handle.get_webview_window("region-selector") {
            let sf = win.scale_factor().unwrap_or(1.0);
            abs_w = (w as f64 * sf).round() as u32;
            abs_h = (h as f64 * sf).round() as u32;
        }
    } else if let Some(win) = handle.get_webview_window("region-selector") {
        let sf = win.scale_factor().unwrap_or(1.0);
        let px = (x as f64 * sf).round() as i32;
        let py = (y as f64 * sf).round() as i32;
        let pw = (w as f64 * sf).round() as u32;
        let ph = (h as f64 * sf).round() as u32;
        
        if let Ok(pos) = win.inner_position() {
            abs_x = pos.x + px;
            abs_y = pos.y + py;
            abs_w = pw;
            abs_h = ph;
        }
    }

    *handle.state::<OverlayResult>().0.lock().unwrap() = Some(SelectedRegion { x: abs_x, y: abs_y, w: abs_w, h: abs_h, screen: 0 });
    if let Some(win) = handle.get_webview_window("region-selector") { let _ = win.close(); }
    Ok(())
}

#[tauri::command]
pub async fn cancel_region_selection(handle:tauri::AppHandle) -> Result<(),String> {
    if let Some(win) = handle.get_webview_window("region-selector") { let _ = win.close(); }
    Ok(())
}

#[tauri::command]
pub async fn select_screen_region(handle:tauri::AppHandle, screen:Option<i32>) -> Result<crate::overlay::SelectedRegion,String> {
    crate::overlay::select_region(&handle, screen.unwrap_or(0)).await
}

#[tauri::command]
pub async fn request_cmd_admin_access(handle: tauri::AppHandle) -> Result<(), String> {
    crate::engine::restart_app_as_admin(&handle)
}

#[tauri::command]
pub async fn is_app_elevated() -> Result<bool, String> {
    Ok(crate::engine::is_process_elevated())
}

// ── Application settings & Tesseract detection ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub tesseract_path: Option<String>,
}

fn get_settings_file_path() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("No parent dir")?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let path = get_settings_file_path()?;
    if !path.exists() {
        // Return default settings, possibly auto-detecting Tesseract
        let default_tess = auto_detect_tesseract();
        return Ok(AppSettings { tesseract_path: default_tess });
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = get_settings_file_path()?;
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn detect_tesseract_path() -> Result<Option<String>, String> {
    Ok(auto_detect_tesseract())
}

fn auto_detect_tesseract() -> Option<String> {
    // 1. Check in PATH environment variable
    if let Ok(path_var) = std::env::var("PATH") {
        for path in std::env::split_paths(&path_var) {
            let exe_path = path.join("tesseract.exe");
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }
    // 2. Check in standard Windows Program Files folder
    if let Ok(prog_files) = std::env::var("ProgramFiles") {
        let p = std::path::Path::new(&prog_files).join("Tesseract-OCR").join("tesseract.exe");
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    // 3. Check in Program Files (x86)
    if let Ok(prog_files_x86) = std::env::var("ProgramFiles(x86)") {
        let p = std::path::Path::new(&prog_files_x86).join("Tesseract-OCR").join("tesseract.exe");
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}
