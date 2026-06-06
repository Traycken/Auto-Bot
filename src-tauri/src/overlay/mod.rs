//! Screen region selector — pure Rust implementation.
//!
//! Ouvre une fenêtre transparente couvrant UN seul moniteur (index passé en paramètre).
//! Utilise un initialization_script pour injecter le bridge IPC Tauri
//! et communique les coordonnées via invoke().

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SelectedRegion { pub x: i32, pub y: i32, pub w: u32, pub h: u32, pub screen: i32 }

pub struct OverlayResult(pub Arc<Mutex<Option<SelectedRegion>>>);

/// Called from the Rust side when the overlay JS reports a region.
pub fn set_result(handle: &AppHandle, region: Option<SelectedRegion>) {
    *handle.state::<OverlayResult>().0.lock().unwrap() = region;
}

pub fn register_protocol(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
}

// L'overlay JS passe les coordonnées LOGIQUES relatives à la fenêtre overlay.
// Le backend ipc::submit_region_selection les convertit en coordonnées physiques globales.
const OVERLAY_JS: &str = r#"
(function() {
  let sx = 0, sy = 0, dragging = false;

  function getInvoke() {
    if (window.__TAURI__ && window.__TAURI__.core) return window.__TAURI__.core.invoke;
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) return window.__TAURI_INTERNALS__.invoke;
    return null;
  }

  function trySetup() {
    const invoke = getInvoke();
    if (!invoke) { setTimeout(trySetup, 20); return; }

    document.addEventListener('DOMContentLoaded', function() {
      const sel    = document.getElementById('sel');
      const coords = document.getElementById('coords');
      const btn    = document.getElementById('cancel-btn');

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
          coords.textContent = x+', '+y+'   '+w+' \u00d7 '+h;
        }
      });

      document.body.addEventListener('pointerup', function(e) {
        if (!dragging) return;
        dragging = false;
        document.body.releasePointerCapture(e.pointerId);
        if (sel)    sel.style.display = 'none';
        if (coords) coords.style.display = 'none';

        var x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
        var w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
        if (w < 5 || h < 5) {
          invoke('submit_region_selection', { x: sx, y: sy, w: 1, h: 1 })
            .catch(function(err) { console.error('[overlay] submit:', err); doCancel(); });
          return;
        }
        invoke('submit_region_selection', { x: x, y: y, w: w, h: h })
          .catch(function(err) { console.error('[overlay] submit:', err); doCancel(); });
      });
    });
  }

  trySetup();
})();
"#;

const OVERLAY_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;user-select:none;cursor:crosshair;background:rgba(0,0,0,0.35)}
#hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:9px 22px;border-radius:8px;font:13px monospace;border:1px solid #555;white-space:nowrap;pointer-events:none;z-index:10}
#sel{position:fixed;display:none;border:2px solid #E84C1E;background:rgba(232,76,30,0.10);pointer-events:none;z-index:5}
#coords{position:fixed;display:none;background:rgba(0,0,0,0.9);color:#E84C1E;font:11px monospace;padding:3px 9px;border-radius:4px;pointer-events:none;z-index:10}
#cancel-btn{position:fixed;top:20px;right:20px;background:#E24B4A;color:#fff;border:none;border-radius:6px;padding:8px 18px;font:12px monospace;cursor:pointer;z-index:20}
#cancel-btn:hover{background:#c93a39}
</style></head>
<body>
<div id="hint">Cliquer et glisser pour sélectionner &nbsp;·&nbsp; Échap pour annuler</div>
<div id="sel"></div>
<div id="coords"></div>
<button id="cancel-btn">✕ Annuler</button>
</body>
</html>"#;

pub async fn select_region(handle: &AppHandle, screen_idx: i32) -> Result<SelectedRegion, String> {
    // Clear previous result
    set_result(handle, None);

    // Close stale overlay if any
    if let Some(old) = handle.get_webview_window("region-selector") {
        let _ = old.close();
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }

    // Position overlay on the requested monitor only
    let (mon_x, mon_y, mon_w, mon_h, screen) = {
        use xcap::Monitor;
        let monitors = Monitor::all().map_err(|e| format!("monitors: {e}"))?;
        if monitors.is_empty() {
            return Err("Aucun moniteur détecté".into());
        }
        let idx = screen_idx.max(0) as usize;
        let mon = monitors.into_iter().nth(idx).ok_or_else(|| format!("Écran {screen_idx} introuvable"))?;
        (mon.x(), mon.y(), mon.width(), mon.height(), idx as i32)
    };

    // Build window covering a single monitor
    WebviewWindowBuilder::new(
        handle,
        "region-selector",
        WebviewUrl::App(std::path::PathBuf::from("overlay.html")),
    )
    .title("Sélectionner une zone")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .position(mon_x as f64, mon_y as f64)
    .inner_size(mon_w as f64, mon_h as f64)
    .initialization_script(OVERLAY_JS)
    .build()
    .map_err(|e| format!("overlay window: {e}"))?;

    // Poll until JS calls submit_region_selection (60s timeout)
    let result_arc = handle.state::<OverlayResult>().0.clone();
    for _ in 0..600 {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        if let Some(mut r) = result_arc.lock().unwrap().clone() {
            if let Some(win) = handle.get_webview_window("region-selector") {
                let _ = win.close();
            }
            r.screen = screen;
            return Ok(r);
        }
    }

    if let Some(win) = handle.get_webview_window("region-selector") {
        let _ = win.close();
    }
    Err("Sélection expirée (60s)".into())
}
