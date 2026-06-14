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

#[allow(dead_code)]
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
pub fn get_screen_index_for_position(x: i32, y: i32) -> i32 {
    crate::overlay::screen_for_region(x, y, 1, 1)
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
pub struct PythonEnvSetting {
    pub name: String,
    pub dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub tesseract_path: Option<String>,
    #[serde(default)]
    pub shortcuts: Vec<crate::engine::ShortcutSetting>,
    #[serde(default)]
    pub python_envs: Vec<PythonEnvSetting>,
    #[serde(default)]
    pub edge_thickness: Option<u32>,
    #[serde(default)]
    pub language: Option<String>,
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
        let default_tess = auto_detect_tesseract();
        return Ok(AppSettings {
            tesseract_path: default_tess,
            shortcuts: vec![],
            python_envs: vec![],
            edge_thickness: Some(4),
            language: Some("fr".to_string()),
        });
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    // Automatically register loaded shortcuts into the engine
    crate::engine::update_global_shortcuts(&settings.shortcuts);
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = get_settings_file_path()?;
    // Update active global shortcuts in the engine
    crate::engine::update_global_shortcuts(&settings.shortcuts);
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

fn get_project_root() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    Some(dir.to_path_buf())
}

#[tauri::command]
pub async fn load_translations(lang: String) -> Result<std::collections::HashMap<String, String>, String> {
    // The Localization folder is located in the same directory as the executable (auto-bot.exe)
    let dir = if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            parent.join("Localization")
        } else {
            std::env::current_dir().unwrap_or_default().join("Localization")
        }
    } else {
        std::env::current_dir().unwrap_or_default().join("Localization")
    };
    
    // Create Localization directory if it doesn't exist to make sure we don't crash
    let _ = std::fs::create_dir_all(&dir);

    // Load EN_en.json (Master & Failsafe)
    let en_path = dir.join("EN_en.json");
    if !en_path.exists() {
        // Create a basic one if missing
        let default_en = r#"{
  "_metadata": {
    "comment": "Master translation guide",
    "instructions": "Keep keys, translate values"
  },
  "app.title": "Auto-Bot Automation Editor"
}"#;
        let _ = std::fs::write(&en_path, default_en);
    }

    let en_content = std::fs::read_to_string(&en_path).map_err(|e| e.to_string())?;
    let raw_val: serde_json::Value = serde_json::from_str(&en_content).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    if let serde_json::Value::Object(obj) = raw_val {
        for (k, v) in obj {
            if let serde_json::Value::String(s) = v {
                map.insert(k, s);
            }
        }
    }

    if lang.to_lowercase().starts_with("en") {
        return Ok(map);
    }

    // Active lang file
    let active_filename = if lang.to_lowercase().starts_with("fr") {
        "FR_fr.json"
    } else {
        &format!("{lang}.json")
    };
    let active_path = dir.join(active_filename);
    if active_path.exists() {
        if let Ok(active_content) = std::fs::read_to_string(&active_path) {
            if let Ok(raw_act) = serde_json::from_str::<serde_json::Value>(&active_content) {
                if let serde_json::Value::Object(obj) = raw_act {
                    for (k, v) in obj {
                        if let serde_json::Value::String(s) = v {
                            map.insert(k, s);
                        }
                    }
                }
            }
        }
    }

    Ok(map)
}#[tauri::command]
pub async fn test_pixel_color(x: i32, y: i32, screen: i32, expected_hex: String, tolerance: u8) -> Result<bool, String> {
    let expected = u32::from_str_radix(expected_hex.trim_start_matches('#'), 16)
        .map_err(|e| format!("Hex color invalide: {e}"))?;
    Ok(sample_pixel_color(x, y, screen, expected, tolerance))
}

#[tauri::command]
pub async fn test_image_match(template_b64: String, x: i32, y: i32, w: u32, h: u32, screen: i32, threshold: String) -> Result<bool, String> {
    let thresh = threshold.parse::<f64>().unwrap_or(0.9);
    let res = match_image_region(&template_b64, x, y, w, h, screen, thresh, "first")?;
    Ok(res.matched)
}

#[tauri::command]
pub async fn test_ocr(x: i32, y: i32, w: u32, h: u32, screen: i32, lang: String, match_text: String) -> Result<bool, String> {
    use std::process::Command;
    let cropped = crate::engine::capture_image_for_ocr(x, y, w, h, screen)
        .map_err(|e| e.to_string())?;
    let temp_dir = std::env::temp_dir();
    let temp_img_path = temp_dir.join("autobot_ocr_test.png");
    cropped.save(&temp_img_path).map_err(|e| e.to_string())?;

    let tesseract_exe = get_tesseract_path()
        .ok_or_else(|| "Tesseract exe non trouvé".to_string())?;
    
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        Command::new(&tesseract_exe)
            .arg(&temp_img_path)
            .arg("stdout")
            .arg("-l")
            .arg(&lang)
            .creation_flags(0x08000000)
            .output()
    };
    #[cfg(not(target_os = "windows"))]
    let output = Command::new(&tesseract_exe)
        .arg(&temp_img_path)
        .arg("stdout")
        .arg("-l")
        .arg(&lang)
        .output();

    let _ = std::fs::remove_file(&temp_img_path);
    let out = output.map_err(|e| e.to_string())?;
    let stdout_text = String::from_utf8_lossy(&out.stdout).to_string();
    
    Ok(stdout_text.to_lowercase().contains(&match_text.to_lowercase()))
}

// Helper function to fetch tesseract path inside this module
fn get_tesseract_path() -> Option<String> {
    if let Some(p) = auto_detect_tesseract() {
        return Some(p);
    }
    // settings check fallback
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
    None
}

#[tauri::command]
pub async fn set_webview_zoom(webview: tauri::Webview, factor: f64) -> Result<(), String> {
    webview.set_zoom(factor).map_err(|e| e.to_string())
}

// ── YOLO/IA helpers & new commands ───────────────────────────────────────────

pub(crate) fn get_yolo_models_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    Some(dir.join("YOLO").join("Models"))
}

pub(crate) async fn download_yolo_model_if_needed(handle: &tauri::AppHandle, model_name: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Emitter;

    let models_dir = get_yolo_models_dir().ok_or("Dossier des modèles non trouvé")?;
    if !models_dir.exists() {
        let _ = std::fs::create_dir_all(&models_dir);
    }

    // 1. Check if it exists directly in the models directory root (backward compatibility / custom imports)
    let direct_path = models_dir.join(model_name);
    if direct_path.exists() {
        return Ok(direct_path);
    }

    // Define key paths
    let folder_name = model_name.replace(".onnx", "");
    let model_folder = models_dir.join(&folder_name);
    let model_path = model_folder.join(model_name);
    let version_path = model_folder.join("version.json");

    // Static runtime check list to only check updates once per overall sequence run
    use std::sync::Mutex;
    static CHECKED_IN_THIS_RUN: Mutex<Option<std::collections::HashSet<String>>> = Mutex::new(None);

    // If a sequence is running, we can check or reset this state
    let is_running = crate::engine::ExecutionEngine::is_running(&handle);
    let mut already_checked_this_run = false;

    if is_running {
        let mut checked = CHECKED_IN_THIS_RUN.lock().unwrap();
        if checked.is_none() {
            *checked = Some(std::collections::HashSet::new());
        }
        if let Some(ref mut set) = *checked {
            if set.contains(model_name) {
                already_checked_this_run = true;
            } else {
                set.insert(model_name.to_string());
            }
        }
    } else {
        // Reset when not running to allow manual verification/testing to check
        let mut checked = CHECKED_IN_THIS_RUN.lock().unwrap();
        *checked = None;
    }

    // Helper structure for version.json
    #[derive(serde::Serialize, serde::Deserialize, Clone)]
    struct ModelVersion {
        version: String,
        last_checked: Option<i64>,
    }

    // Determine target version by loading or checking with GitHub release API
    let mut target_version = "v8.3.0".to_string(); // fallback
    let mut must_query_github = !already_checked_this_run;

    // Load current version file
    let mut current_version_data: Option<ModelVersion> = None;
    if version_path.exists() {
        if let Ok(data) = std::fs::read_to_string(&version_path) {
            if let Ok(ver) = serde_json::from_str::<ModelVersion>(&data) {
                current_version_data = Some(ver.clone());
                target_version = ver.version.clone();
                // Check if last check was less than 1 hour ago
                if let Some(last_check) = ver.last_checked {
                    let now = chrono::Utc::now().timestamp();
                    if now - last_check < 3600 {
                        must_query_github = false;
                    }
                }
            }
        }
    }

    let client = reqwest::Client::new();

    // Query GitHub release if needed
    if must_query_github {
        let _ = handle.emit("yolo://progress", serde_json::json!({
            "status": "checking",
            "progress": 0
        }));

        #[derive(serde::Deserialize)]
        struct GithubRelease {
            tag_name: String,
        }

        if let Ok(res) = client.get("https://api.github.com/repos/ultralytics/assets/releases/latest")
            .header("User-Agent", "auto-bot")
            .send()
            .await
        {
            if let Ok(release) = res.json::<GithubRelease>().await {
                target_version = release.tag_name;
            }
        }

        // Update version file with last check timestamp
        let version_json = ModelVersion {
            version: target_version.clone(),
            last_checked: Some(chrono::Utc::now().timestamp()),
        };
        let _ = std::fs::create_dir_all(&model_folder);
        if let Ok(version_data) = serde_json::to_string_pretty(&version_json) {
            let _ = std::fs::write(&version_path, version_data);
        }
    }

    let dl_name = if model_name.starts_with("yolo11") || model_name.starts_with("yolov11") {
        model_name.replace("yolov11", "yolo11").replace(".onnx", ".pt")
    } else if model_name.starts_with("yolo12") || model_name.starts_with("yolov12") {
        model_name.replace("yolov12", "yolo12").replace(".onnx", ".pt")
    } else {
        model_name.replace(".onnx", ".pt")
    };

    // Determine if we need to download
    let mut need_download = true;
    if model_path.exists() && current_version_data.is_some() {
        if let Some(ref ver) = current_version_data {
            if ver.version == target_version {
                need_download = false;
            }
        }
    }

    if !need_download {
        return Ok(model_path);
    }

    // Prepare model folder
    let _ = std::fs::create_dir_all(&model_folder);

    // Download the .pt file
    let pt_path = model_folder.join(&dl_name);

    if !pt_path.exists() {
        let url = format!(
            "https://github.com/ultralytics/assets/releases/latest/download/{}",
            dl_name
        );

        let _ = handle.emit("yolo://progress", serde_json::json!({
            "status": "downloading",
            "progress": 0
        }));

        let res = client.get(&url).send().await.map_err(|e| format!("Erreur de téléchargement du fichier .pt: {e}"))?;
        if !res.status().is_success() {
            let err_msg = format!("Impossible de télécharger le fichier .pt ({}): {}", res.status(), url);
            let _ = handle.emit("yolo://progress", serde_json::json!({
                "status": "error",
                "progress": 0,
                "error": err_msg
            }));
            return Err(err_msg);
        }

        let total_size = res.content_length().unwrap_or(0);
        let mut file = std::fs::File::create(&pt_path).map_err(|e| format!("Erreur de création du fichier .pt: {e}"))?;
        let mut downloaded: u64 = 0;

        use std::io::Write;
        let mut stream = res.bytes_stream();
        use tokio_stream::StreamExt;
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Erreur de lecture du flux de téléchargement: {e}"))?;
            file.write_all(&chunk).map_err(|e| format!("Erreur d'écriture du flux dans le fichier: {e}"))?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
                let _ = handle.emit("yolo://progress", serde_json::json!({
                    "status": "downloading",
                    "progress": progress
                }));
            }
        }
    }

    // Resolve the yolo base directory (exe_dir/YOLO)
    let root = get_project_root().ok_or("Impossible de trouver la racine de l'exécutable")?;
    let yolo_dir = root.join("YOLO");
    let venv_dir = yolo_dir.join(".venv");

    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel::<()>(1);
    let handle_clone = handle.clone();
    
    // Spawn progress timer task for conversion
    let progress_timer_handle = tokio::spawn(async move {
        let mut progress_val = 0;
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(500));
        loop {
            tokio::select! {
                _ = progress_rx.recv() => {
                    break;
                }
                _ = interval.tick() => {
                    if progress_val < 99 {
                        progress_val += 3;
                        if progress_val > 99 { progress_val = 99; }
                        let _ = handle_clone.emit("yolo://progress", serde_json::json!({
                            "status": "converting",
                            "progress": progress_val
                        }));
                    }
                }
            }
        }
    });

    let _ = handle.emit("yolo://progress", serde_json::json!({
        "status": "converting",
        "progress": 0
    }));

    // Initialize venv inside yolo_dir if it doesn't exist
    if !venv_dir.exists() {
        let _ = std::fs::create_dir_all(&yolo_dir);
        let mut cmd = tokio::process::Command::new("uv");
        cmd.args(["venv"]);
        cmd.current_dir(&yolo_dir);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.as_std_mut().creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let _ = cmd.output().await;
    }

    // Run uv export yolo command
    let pt_path_str = pt_path.to_string_lossy().to_string();
    let mut cmd = tokio::process::Command::new("uv");
    cmd.args([
        "run",
        "--with", "ultralytics",
        "yolo", "export",
        &format!("model={}", pt_path_str),
        "format=onnx",
        "opset=13",
        "simplify=True"
    ]);
    cmd.current_dir(&yolo_dir);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.as_std_mut().creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await;
    
    // Stop the progress timer
    let _ = progress_tx.send(()).await;
    let _ = progress_timer_handle.await;

    let output = output.map_err(|e| format!("Impossible d'exécuter la conversion: {e}"))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = handle.emit("yolo://progress", serde_json::json!({
            "status": "error",
            "progress": 0,
            "error": format!("La conversion du modèle en ONNX a échoué: {}", err_msg)
        }));
        return Err(format!("La conversion du modèle en ONNX a échoué: {err_msg}"));
    }

    // Clean up .pt file
    let _ = std::fs::remove_file(&pt_path);

    // If the exported file was named after the download name (e.g. yolo11n.onnx) but the user expects
    // the model name (e.g. yolov11n.onnx), rename it.
    let exported_onnx_name = dl_name.replace(".pt", ".onnx");
    let exported_onnx_path = model_folder.join(&exported_onnx_name);
    if exported_onnx_path.exists() && exported_onnx_path != model_path {
        let _ = std::fs::rename(&exported_onnx_path, &model_path);
    }

    if !model_path.exists() {
        let err_msg = "Le fichier .onnx n'a pas été généré par l'exportation.".to_string();
        let _ = handle.emit("yolo://progress", serde_json::json!({
            "status": "error",
            "progress": 0,
            "error": err_msg
        }));
        return Err(err_msg);
    }

    // Write version.json
    let version_json = serde_json::json!({
        "version": target_version
    });
    let version_data = serde_json::to_string_pretty(&version_json).unwrap_or_default();
    let _ = std::fs::write(&version_path, version_data);

    let _ = handle.emit("yolo://progress", serde_json::json!({
        "status": "done",
        "progress": 100
    }));

    Ok(model_path)
}

#[tauri::command]
pub async fn list_yolo_models() -> Result<Vec<String>, String> {
    let models_dir = get_yolo_models_dir().ok_or_else(|| "Dossier des modèles non trouvé".to_string())?;
    if !models_dir.exists() {
        let _ = std::fs::create_dir_all(&models_dir);
    }
    let mut models = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "onnx") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    models.push(name.to_string());
                }
            } else if path.is_dir() {
                // Scan subdirectories (Models/{Folder}/{Model}.onnx)
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() && sub_path.extension().map_or(false, |ext| ext == "onnx") {
                            if let Some(name) = sub_path.file_name().and_then(|n| n.to_str()) {
                                models.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(models)
}

#[tauri::command]
pub async fn recreate_yolo_venv() -> Result<(), String> {
    let root = get_project_root().ok_or("Impossible de trouver le dossier de l'exécutable")?;
    let yolo_dir = root.join("YOLO");
    let venv_dir = yolo_dir.join(".venv");
    
    // Delete .venv if it exists
    if venv_dir.exists() {
        if venv_dir.is_file() {
            let _ = std::fs::remove_file(&venv_dir);
        } else {
            std::fs::remove_dir_all(&venv_dir).map_err(|e| format!("Impossible de supprimer l'ancien .venv: {e}"))?;
        }
    }
    
    // Create YOLO directory if it doesn't exist
    if !yolo_dir.exists() {
        let _ = std::fs::create_dir_all(&yolo_dir);
    }
    
    let run_hidden_command = |mut cmd: std::process::Command| -> Result<std::process::Output, String> {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output().map_err(|e| format!("Impossible d'exécuter le processus: {e}"))
    };

    // Run uv venv
    let mut cmd = std::process::Command::new("uv");
    cmd.args(["venv"]);
    cmd.current_dir(&yolo_dir);
    let output = run_hidden_command(cmd)?;
    if !output.status.success() {
        return Err(format!("uv venv a échoué: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    // Run uv pip install ultralytics
    let mut cmd_install = std::process::Command::new("uv");
    cmd_install.args(["pip", "install", "ultralytics"]);
    cmd_install.current_dir(&yolo_dir);
    let output_install = run_hidden_command(cmd_install)?;
    if !output_install.status.success() {
        return Err(format!("uv pip install ultralytics a échoué: {}", String::from_utf8_lossy(&output_install.stderr)));
    }
    
    Ok(())
}

#[tauri::command]
pub async fn import_yolo_model(file_path: String) -> Result<String, String> {
    let src = std::path::Path::new(&file_path);
    if !src.exists() {
        return Err("Le fichier sélectionné n'existe pas.".to_string());
    }
    let name = src.file_name().ok_or("Nom de fichier invalide")?;
    let models_dir = get_yolo_models_dir().ok_or("Dossier des modèles non trouvé")?;
    if !models_dir.exists() {
        let _ = std::fs::create_dir_all(&models_dir);
    }
    let dest = models_dir.join(name);
    std::fs::copy(src, &dest).map_err(|e| format!("Erreur de copie: {e}"))?;
    Ok(name.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn test_ia(
    mode: String,
    prompt: String,
    api_mode: String,
    api_key: String,
    model_name: String,
    api_url: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    screen: i32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let base_url = if api_url.is_empty() {
        if api_mode == "local" {
            "http://localhost:11434/v1".to_string()
        } else {
            "https://api.openai.com/v1".to_string()
        }
    } else {
        api_url.trim_end_matches('/').to_string()
    };

    let url = if base_url.ends_with("/chat/completions") {
        base_url
    } else if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };

    let b64_img = if mode == "image" {
        match crate::engine::capture_image_for_ocr(x, y, w, h, screen) {
            Ok(cropped) => {
                let mut buf = Vec::new();
                if cropped.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png).is_ok() {
                    use base64::Engine as _;
                    Some(base64::engine::general_purpose::STANDARD.encode(&buf))
                } else {
                    None
                }
            }
            Err(e) => {
                return Err(format!("Erreur de capture d'image: {}", e));
            }
        }
    } else {
        None
    };

    let messages = if let Some(b64) = b64_img {
        serde_json::json!([
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/png;base64,{}", b64)
                        }
                    }
                ]
            }
        ])
    } else {
        serde_json::json!([
            {
                "role": "user",
                "content": prompt
            }
        ])
    };

    let payload = serde_json::json!({
        "model": model_name,
        "messages": messages
    });

    let mut req = client.post(&url);
    if !api_key.is_empty() {
        req = req.bearer_auth(&api_key);
    }

    let res = req.json(&payload).send().await.map_err(|e| format!("Erreur HTTP: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Erreur API ({status}): {body}"));
    }

    #[derive(serde::Deserialize)]
    struct ChatChoice {
        message: ChatMessage,
    }
    #[derive(serde::Deserialize)]
    struct ChatMessage {
        content: Option<String>,
    }
    #[derive(serde::Deserialize)]
    struct ChatResponse {
        choices: Option<Vec<ChatChoice>>,
    }

    let chat_resp = res.json::<ChatResponse>().await.map_err(|e| format!("Erreur JSON: {e}"))?;
    let content = chat_resp.choices
        .and_then(|c| c.into_iter().next())
        .and_then(|choice| choice.message.content)
        .ok_or_else(|| "Réponse vide de l'API".to_string())?;

    Ok(content)
}

#[tauri::command]
pub async fn discover_ia_models(api_mode: String, api_key: String, api_url: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let base_url = if api_url.is_empty() {
        if api_mode == "local" {
            "http://localhost:11434/v1".to_string()
        } else {
            "https://api.openai.com/v1".to_string()
        }
    } else {
        api_url.trim_end_matches('/').to_string()
    };

    // Try OpenAI / v1 standard models endpoint first
    let url_v1 = if base_url.ends_with("/v1") {
        format!("{}/models", base_url)
    } else {
        format!("{}/v1/models", base_url)
    };

    let mut req = client.get(&url_v1);
    if !api_key.is_empty() {
        req = req.bearer_auth(&api_key);
    }

    if let Ok(res) = req.send().await {
        if res.status().is_success() {
            #[derive(serde::Deserialize)]
            struct ModelItem { id: String }
            #[derive(serde::Deserialize)]
            struct ModelsResponse { data: Vec<ModelItem> }
            if let Ok(resp) = res.json::<ModelsResponse>().await {
                let names: Vec<String> = resp.data.into_iter().map(|m| m.id).collect();
                if !names.is_empty() {
                    return Ok(names);
                }
            }
        }
    }

    // Fallback for Ollama custom api/tags endpoint
    let host = base_url.split("/v1").next().unwrap_or(&base_url);
    let ollama_url = format!("{}/api/tags", host);

    let mut req_ol = client.get(&ollama_url);
    if !api_key.is_empty() {
        req_ol = req_ol.bearer_auth(&api_key);
    }
    if let Ok(res) = req_ol.send().await {
        if res.status().is_success() {
            #[derive(serde::Deserialize)]
            struct OlModel { name: String }
            #[derive(serde::Deserialize)]
            struct OlResponse { models: Vec<OlModel> }
            if let Ok(resp) = res.json::<OlResponse>().await {
                let names = resp.models.into_iter().map(|m| m.name).collect();
                return Ok(names);
            }
        }
    }

    Err("Impossible de récupérer les modèles via les points de terminaison standard (/v1/models ou /api/tags)".to_string())
}

#[tauri::command]
pub async fn test_yolo(
    handle: tauri::AppHandle,
    model_name: String,
    mode: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    screen: i32,
    threshold: String,
) -> Result<String, String> {
    let thresh = threshold.parse::<f32>().unwrap_or(0.5);
    
    let model_path = download_yolo_model_if_needed(&handle, &model_name).await?;
    
    let cropped = crate::engine::capture_image_for_ocr(x, y, w, h, screen)
        .map_err(|e| format!("Erreur de capture d'image: {e}"))?;
    
    let dyn_img = image::DynamicImage::ImageRgba8(cropped);

    let config = ultralytics_inference::InferenceConfig::default()
        .with_confidence(thresh);
    let mut model = ultralytics_inference::YOLOModel::load_with_config(&model_path, config)
        .map_err(|e| format!("Erreur lors du chargement du modèle: {e}"))?;
    
    let results = model.predict_image(&dyn_img, "test_frame".to_string())
        .map_err(|e| format!("Erreur de prédiction YOLO: {e}"))?;
    
    if let Some(result) = results.first() {
        if mode == "classify" {
            if let Some(ref probs) = result.probs {
                let top_indices = probs.top_k(probs.data.len());
                let mut class_names = Vec::new();
                for cls_id in top_indices {
                    let conf = *probs.data.get(cls_id).unwrap_or(&0.0);
                    if conf >= thresh {
                        if let Some(name) = result.names.get(&cls_id) {
                            class_names.push(name.clone());
                        }
                    }
                }
                let output = serde_json::Value::Array(
                    class_names.into_iter().map(serde_json::Value::String).collect()
                );
                return Ok(serde_json::to_string_pretty(&output).unwrap_or_default());
            } else {
                return Err("Le modèle ne produit pas de classification (pas de probs).".to_string());
            }
        } else {
            // mode == "detect"
            if let Some(ref boxes) = result.boxes {
                let xyxy_matrix = boxes.xyxy();
                let mut detection_dict: std::collections::HashMap<String, std::collections::HashMap<String, serde_json::Value>> = std::collections::HashMap::new();

                for i in 0..boxes.len() {
                    let conf = boxes.conf()[i];
                    if conf < thresh {
                        continue;
                    }
                    let cls = boxes.cls()[i] as usize;
                    let name = result.names.get(&cls).map(|s| s.as_str()).unwrap_or("unknown").to_string();
                    
                    let b_coords = xyxy_matrix.row(i);
                    let x = b_coords[0].round() as i32;
                    let y = b_coords[1].round() as i32;
                    let w = (b_coords[2] - b_coords[0]).round() as i32;
                    let h = (b_coords[3] - b_coords[1]).round() as i32;
                    let conf_pct = (conf * 100.0).round() as i32;

                    let box_val = serde_json::json!({
                        "bbox": [x, y, w, h],
                        "conf": conf_pct
                    });

                    let class_entry = detection_dict.entry(name).or_default();
                    let index_str = class_entry.len().to_string();
                    class_entry.insert(index_str, box_val);
                }
                let dict_val = serde_json::to_value(&detection_dict).unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                return Ok(serde_json::to_string_pretty(&dict_val).unwrap_or_default());
            } else {
                return Err("Le modèle ne produit pas de détection (pas de boxes).".to_string());
            }
        }
    }
    
    Ok("{}".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UvPythonVersion {
    pub value: String,
    pub label: String,
    pub installed: bool,
}

#[command]
pub async fn get_uv_python_versions() -> Result<Vec<UvPythonVersion>, String> {
    let uv_exe = if let Ok(home) = std::env::var("USERPROFILE") {
        let p = std::path::Path::new(&home).join(".local").join("bin").join("uv.exe");
        if p.exists() { p.to_string_lossy().to_string() } else { "uv".to_string() }
    } else if let Ok(home) = std::env::var("HOME") {
        let p = std::path::Path::new(&home).join(".local").join("bin").join("uv");
        if p.exists() { p.to_string_lossy().to_string() } else { "uv".to_string() }
    } else {
        "uv".to_string()
    };

    let mut cmd = std::process::Command::new(uv_exe);
    cmd.args(["python", "list", "--all-versions"]);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let mut versions = Vec::new();
    let re = regex::Regex::new(r"cpython-3\.[0-9]*\.[0-9]*[a-zA-Z]").unwrap();

    for line in stdout.lines() {
        let line_lower = line.to_lowercase();
        if !line_lower.contains("cpython") { continue; }
        if !line_lower.contains("windows-x86_64") { continue; }
        if line_lower.contains("freethreaded") { continue; }
        if re.is_match(line) { continue; }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() { continue; }
        let full_name = parts[0].to_string();
        
        let label = if full_name.starts_with("cpython-") {
            full_name.split('-').nth(1).unwrap_or(&full_name).to_string()
        } else {
            full_name.clone()
        };

        let installed = if parts.len() > 1 {
            let rest = parts[1..].join(" ");
            !rest.contains("<download")
        } else {
            false
        };

        versions.push(UvPythonVersion {
            value: label.clone(),
            label: format!("Python {}", label),
            installed,
        });
    }

    let mut deduped: Vec<UvPythonVersion> = Vec::new();
    for v in versions {
        if let Some(existing) = deduped.iter_mut().find(|x| x.value == v.value) {
            if v.installed {
                existing.installed = true;
            }
        } else {
            deduped.push(v);
        }
    }

    Ok(deduped)
}
