use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindowBuilder, WebviewUrl};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SelectedRegion {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub screen: i32,
}

pub struct OverlayResult(pub Arc<Mutex<Option<SelectedRegion>>>);

pub fn set_result(handle: &AppHandle, region: Option<SelectedRegion>) {
    *handle.state::<OverlayResult>().0.lock().unwrap() = region;
}

pub fn register_protocol(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
}

const OVERLAY_JS: &str = r#"
(function() {
  let sx = 0, sy = 0, dragging = false;

  function getInvoke() {
    if (window.__TAURI__ && window.__TAURI__.core) return window.__TAURI__.core.invoke;
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) return window.__TAURI_INTERNALS__.invoke;
    return null;
  }

  function setup() {
    const invoke = getInvoke();
    if (!invoke) { setTimeout(setup, 20); return; }

    const sel = document.getElementById('sel');
    const coords = document.getElementById('coords');
    const btn = document.getElementById('cancel-btn');

    function doCancel() {
      invoke('cancel_region_selection').catch(function(){});
    }

    if (btn) btn.addEventListener('click', doCancel);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') doCancel();
    });

    document.body.addEventListener('pointerdown', function(e) {
      if (e.target && e.target.id === 'cancel-btn') return;
      e.preventDefault();
      document.body.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; dragging = true;
      if (sel) sel.style.cssText = 'display:block;left:'+sx+'px;top:'+sy+'px;width:0;height:0';
    });

    document.body.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      var x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
      var w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      if (sel) {
        sel.style.left = x+'px'; sel.style.top = y+'px';
        sel.style.width = w+'px'; sel.style.height = h+'px';
      }
      if (coords) {
        coords.style.cssText = 'display:block;left:'+(e.clientX+16)+'px;top:'+(e.clientY+16)+'px';
        coords.textContent = Math.round(x)+', '+Math.round(y)+'   '+Math.round(w)+' x '+Math.round(h);
      }
    });

    document.body.addEventListener('pointerup', function(e) {
      if (!dragging) return;
      dragging = false;
      document.body.releasePointerCapture(e.pointerId);
      if (sel) sel.style.display = 'none';
      if (coords) coords.style.display = 'none';

      var x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
      var w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      if (w < 5 || h < 5) { w = 1; h = 1; x = sx; y = sy; }
      var dpr = window.devicePixelRatio || 1;
      invoke('submit_region_selection', {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        originX: Math.round((window.screenX + x) * dpr),
        originY: Math.round((window.screenY + y) * dpr)
      }).catch(function(err) { console.error('[overlay] submit:', err); doCancel(); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
"#;

pub async fn select_region(handle: &AppHandle, _screen_idx: i32) -> Result<SelectedRegion, String> {
    set_result(handle, None);

    if let Some(old) = handle.get_webview_window("region-selector") {
        let _ = old.close();
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }

    let (desk_x, desk_y, desk_w, desk_h) = virtual_desktop_bounds()?;

    let overlay = WebviewWindowBuilder::new(
        handle,
        "region-selector",
        WebviewUrl::App(std::path::PathBuf::from("overlay.html")),
    )
    .title("Selectionner une zone")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .initialization_script(OVERLAY_JS)
    .build()
    .map_err(|e| format!("overlay window: {e}"))?;

    overlay
        .set_position(PhysicalPosition::new(desk_x, desk_y))
        .map_err(|e| format!("overlay position: {e}"))?;
    overlay
        .set_size(PhysicalSize::new(desk_w, desk_h))
        .map_err(|e| format!("overlay size: {e}"))?;

    let result_arc = handle.state::<OverlayResult>().0.clone();
    for _ in 0..600 {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let selected = { result_arc.lock().unwrap().clone() };
        if let Some(mut r) = selected {
            if let Some(win) = handle.get_webview_window("region-selector") {
                let _ = win.close();
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(180)).await;
            r.screen = screen_for_region(r.x, r.y, r.w, r.h);
            return Ok(r);
        }
    }

    if let Some(win) = handle.get_webview_window("region-selector") {
        let _ = win.close();
    }
    Err("Selection expiree (60s)".into())
}

fn virtual_desktop_bounds() -> Result<(i32, i32, u32, u32), String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("monitors: {e}"))?;
    if monitors.is_empty() {
        return Err("Aucun moniteur detecte".into());
    }
    let min_x = monitors.iter().map(|m| m.x()).min().unwrap_or(0);
    let min_y = monitors.iter().map(|m| m.y()).min().unwrap_or(0);
    let max_x = monitors.iter().map(|m| m.x() + m.width() as i32).max().unwrap_or(1920);
    let max_y = monitors.iter().map(|m| m.y() + m.height() as i32).max().unwrap_or(1080);
    
    let w = (max_x - min_x).max(1) as u32;
    let h = (max_y - min_y).max(1) as u32;
    
    let extra_w = (w as f64 * 0.1).round() as u32;
    let extra_h = (h as f64 * 0.1).round() as u32;
    
    let new_w = w + extra_w;
    let new_h = h + extra_h;
    let new_x = min_x - (extra_w / 2) as i32;
    let new_y = min_y - (extra_h / 2) as i32;
    
    Ok((new_x, new_y, new_w, new_h))
}

fn screen_for_region(x: i32, y: i32, w: u32, h: u32) -> i32 {
    let Ok(monitors) = xcap::Monitor::all() else { return 0 };
    let cx = x + (w / 2) as i32;
    let cy = y + (h / 2) as i32;
    monitors
        .iter()
        .position(|m| {
            cx >= m.x()
                && cy >= m.y()
                && cx < m.x() + m.width() as i32
                && cy < m.y() + m.height() as i32
        })
        .unwrap_or(0) as i32
}
