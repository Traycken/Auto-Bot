use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings};
use log::info;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

use crate::blocks::{Block, Graph, GraphEdge, GraphNode, MouseButton, interpolate_text};

type Vars = HashMap<String, String>;
type Adj  = HashMap<String, Vec<(String, String, String)>>;

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
            let _ = h2.emit("engine://started", ());
            let mut vars = Vars::new();
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(e) => { let _ = h2.emit("engine://error", format!("Enigo: {e}")); return; }
            };
            match run_from_start(&h2, &graph, &mut vars, &mut enigo, &token).await {
                Ok(_)  => { let _ = h2.emit("engine://done", ()); }
                Err(e) => { let _ = h2.emit("engine://error", e.to_string()); }
            }
        });
    }
    pub fn stop(handle: &AppHandle) {
        let state = handle.state::<ExecutionEngine>();
        if let Some(t) = state.token.lock().unwrap().take() { t.cancel(); }
        let _ = handle.emit("engine://stopped", ());
    }
}

// ── Graph traversal ───────────────────────────────────────────────────────────

async fn run_from_start(h: &AppHandle, graph: &Graph, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<()> {
    let adj = graph.adjacency();
    let start_id = graph.start_id().ok_or_else(|| anyhow!("Aucun nœud Départ trouvé"))?;
    let _ = h.emit("engine://log", format!("Start: {start_id}"));
    match follow(&adj, &start_id, "", "") {
        Some(first) => run_chain(h, graph, &adj, &first, vars, enigo, token).await?,
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
async fn run_chain(h: &AppHandle, graph: &Graph, adj: &Adj, node_id: &str, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<()> {
    if token.is_cancelled() { return Ok(()); }
    let node = graph.node(node_id).ok_or_else(|| anyhow!("Node not found: {node_id}"))?;
    let out = exec_node(h, graph, adj, node_id, &node.data, vars, enigo, token).await?;
    if token.is_cancelled() { return Ok(()); }
    if let Some(next) = follow(adj, node_id, &out, "") {
        run_chain(h, graph, adj, &next, vars, enigo, token).await?;
    }
    Ok(())
}

// ── Node executor ─────────────────────────────────────────────────────────────

#[async_recursion::async_recursion]
async fn exec_node(h: &AppHandle, graph: &Graph, adj: &Adj, node_id: &str, block: &Block, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<String> {
    let kind = bk(block);
    info!("[exec] {kind} ({node_id})");
    let _ = h.emit("engine://block-start", serde_json::json!({"kind": kind}));

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
                tokio::select! { _ = sleep(Duration::from_millis(ms)) => {} _ = token.cancelled() => {} }
            }
            "".into()
        }

        Block::ForLoop(b) => {
            let from = eval_full(&b.from, vars);
            let to   = eval_full(&b.to,   vars);
            let step = eval_full(&b.step, vars);
            if step == 0.0 { return Err(anyhow!("ForLoop step=0")); }
            let prev = vars.get(&b.var_name).cloned();
            vars.insert(b.var_name.clone(), fmt_num(from));
            'lp: loop {
                if token.is_cancelled() { break; }
                let cur = vars.get(&b.var_name).and_then(|s| s.parse::<f64>().ok()).unwrap_or(from);
                if (step>0.0&&cur>to)||(step<0.0&&cur<to) { break; }
                let _ = h.emit("engine://for-tick", serde_json::json!({"var":&b.var_name,"value":fmt_num(cur)}));
                tokio::task::yield_now().await;
                if let Some(body_start) = follow(adj, node_id, "body", "") {
                    let sig = run_for_body(h, graph, adj, &body_start, node_id, vars, enigo, token).await?;
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
    };

    let _ = h.emit("engine://block-done", serde_json::json!({"kind": kind}));
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
        run_chain(h, &fn_graph, &adj, &first, &mut fn_vars, enigo, token).await?;
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
async fn run_for_body(h: &AppHandle, graph: &Graph, adj: &Adj, node_id: &str, for_id: &str, vars: &mut Vars, enigo: &mut Enigo, token: &CancellationToken) -> Result<String> {
    if token.is_cancelled() { return Ok("break".into()); }
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
            return run_for_body(h,graph,adj,&nid,for_id,vars,enigo,token).await;
        }
        if edges.iter().any(|(t,sh,th)| t==for_id&&th=="break"&&(sh==&out||sh.is_empty())) { return Ok("break".into()); }
    }
    Ok("".into())
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

// ── Expression evaluator ──────────────────────────────────────────────────────

pub fn eval_full(expr: &str, vars: &Vars) -> f64 {
    let mut s = expr.replace("%%", "\x00");
    { let mut names:Vec<_>=vars.keys().collect(); names.sort_by_key(|k| Reverse(k.len())); for name in names { s=s.replace(&format!("%{name}"),vars[name].as_str()); } }
    s = s.replace('\x00', "%");
    let s = eval_curpos_calls(&s);
    let s = eval_count_calls(&s, vars);
    let s = eval_random_calls(&s);
    let s = eval_math_fns(&s, vars);
    let trimmed = s.trim();
    if trimmed.chars().all(|c| c.is_ascii_digit()||" +-*/.()".contains(c)) { crate::blocks::tiny_eval(trimmed).unwrap_or(0.0) } else { trimmed.parse::<f64>().unwrap_or(0.0) }
}

fn eval_count_calls(s: &str, vars: &Vars) -> String {
    let mut result = s.to_string();
    while let Some(start) = result.find("count(") {
        let inner_start = start + 6;
        let mut depth = 1usize;
        let mut end = inner_start;
        let bytes = result.as_bytes();
        while end < bytes.len() && depth > 0 {
            match bytes[end] {
                b'(' => depth += 1,
                b')' => depth -= 1,
                _ => {}
            }
            if depth > 0 { end += 1; }
        }
        if depth != 0 { break; }
        let arg = &result[inner_start..end];
        let val_resolved = if arg.starts_with('%') {
            vars.get(arg.trim_start_matches('%')).map(|x| x.as_str()).unwrap_or("")
        } else {
            arg
        };

        let count_val = if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(val_resolved) {
            arr.len()
        } else if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(val_resolved) {
            map.len()
        } else {
            val_resolved.chars().count()
        };

        result = format!("{}{}{}", &result[..start], count_val, &result[end+1..]);
    }
    result
}

fn eval_curpos_calls(s: &str) -> String {
    let mut result = s.to_string();
    while let Some(start) = result.find("curpos(") {
        let inner_start = start + 7;
        let mut depth = 1usize;
        let mut end = inner_start;
        let bytes = result.as_bytes();
        while end < bytes.len() && depth > 0 {
            match bytes[end] {
                b'(' => depth += 1,
                b')' => depth -= 1,
                _ => {}
            }
            if depth > 0 { end += 1; }
        }
        if depth != 0 { break; }
        let args_str = &result[inner_start..end];
        let replacement = eval_curpos_args(args_str);
        result = format!("{}{}{}", &result[..start], replacement, &result[end+1..]);
    }
    result
}

fn eval_curpos_args(args: &str) -> String {
    let parts: Vec<&str> = args.split(',').map(str::trim).collect();
    if parts.is_empty() { return "0".into(); }
    let coord_type = parts[0].to_lowercase();
    
    let cursor = match crate::ipc::get_cursor_pos_now() {
        Ok(pos) => pos,
        Err(_) => return "0".into(),
    };
    let mut x = cursor.x;
    let mut y = cursor.y;

    if parts.len() >= 2 {
        if let Ok(scr) = parts[1].parse::<i32>() {
            use xcap::Monitor;
            if let Ok(monitors) = Monitor::all() {
                if let Some(mon) = monitors.get(scr as usize) {
                    x -= mon.x();
                    y -= mon.y();
                }
            }
        }
    }

    if coord_type == "x" {
        x.to_string()
    } else if coord_type == "y" {
        y.to_string()
    } else {
        "0".into()
    }
}

fn eval_random_calls(s: &str) -> String {
    let mut result = s.to_string();
    while let Some(start) = result.find("random(") {
        let inner_start = start+7; let mut depth=1usize; let mut end=inner_start; let bytes=result.as_bytes();
        while end<bytes.len()&&depth>0 { match bytes[end] { b'('=> depth+=1, b')'=> depth-=1, _=>{} } if depth>0{end+=1;} }
        if depth!=0{break;}
        let args_str=&result[inner_start..end]; let replacement=eval_random_args(args_str);
        result=format!("{}{}{}",&result[..start],replacement,&result[end+1..]);
    }
    result
}

fn eval_random_args(args: &str) -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let parts:Vec<&str>=args.split(',').map(str::trim).collect();
    if args.trim_start().starts_with('[') { let list_end=args.find(']').unwrap_or(args.len()); let items:Vec<&str>=args[1..list_end].split(',').map(str::trim).filter(|s|!s.is_empty()).collect(); if items.is_empty(){return "0".into();}return items[rng.gen_range(0..items.len())].into();}
    if parts.len()>=2&&(parts[0]=="true"||parts[0]=="false") { return if rng.gen_bool(0.5){parts[0]}else{parts[1]}.into(); }
    let mn:f64=parts.first().and_then(|s|s.parse().ok()).unwrap_or(0.0); let mx:f64=parts.get(1).and_then(|s|s.parse().ok()).unwrap_or(100.0);
    if let Some(seed_str)=parts.get(2) { if let Ok(seed)=seed_str.parse::<u64>() { use rand::SeedableRng; use rand::rngs::StdRng; let mut seeded=StdRng::seed_from_u64(seed); return fmt_num(seeded.gen_range(mn..=mx.max(mn))); } }
    fmt_num(rng.gen_range(mn..=mx.max(mn)))
}

fn eval_math_fns(s: &str, _vars: &Vars) -> String {
    let mut result = s.to_string();
    for func in &["round","ceil","floor"] {
        let pattern=format!("{func}(");
        while let Some(start)=result.find(&pattern) {
            let inner=start+func.len()+1; let mut depth=1usize; let mut end=inner; let bytes=result.as_bytes();
            while end<bytes.len()&&depth>0 { match bytes[end]{b'('=> depth+=1,b')'=> depth-=1,_=>{}} if depth>0{end+=1;} }
            if depth!=0{break;}
            let args_str=&result[inner..end]; let parts:Vec<&str>=args_str.splitn(2,',').collect();
            let val:f64=parts.first().and_then(|s|s.trim().parse().ok()).unwrap_or(0.0); let digits:i32=parts.get(1).and_then(|s|s.trim().parse().ok()).unwrap_or(0);
            let factor=10f64.powi(digits); let rounded=match *func{"round"=>(val*factor).round()/factor,"ceil"=>(val*factor).ceil()/factor,"floor"=>(val*factor).floor()/factor,_=>val};
            result=format!("{}{}{}",&result[..start],fmt_num(rounded),&result[end+1..]);
        }
    }
    result
}

fn eval_cond(cond: &str, vars: &Vars) -> bool {
    let mut s = cond.replace("%%","\x00");
    let mut names:Vec<_>=vars.keys().collect(); names.sort_by_key(|k| Reverse(k.len()));
    for name in names { s=s.replace(&format!("%{name}"),vars[name].as_str()); }
    s=s.replace('\x00',"%");
    let s=s.trim().trim_start_matches('{').trim_end_matches('}');
    if s.contains("||") { return s.split("||").any(|p| eval_and(p.trim())); }
    eval_and(s)
}
fn eval_and(e: &str) -> bool {
    if e.contains("&&") { return e.split("&&").all(|p| eval_cmp(p.trim())); }
    eval_cmp(e)
}
fn eval_cmp(expr: &str) -> bool {
    for op in &[">=","<=","!=","==",">","<"] {
        if let Some(i)=expr.find(op) {
            let l=expr[..i].trim().trim_matches('"').trim_matches('\'');
            let r=expr[i+op.len()..].trim().trim_matches('"').trim_matches('\'');
            let lv:f64=l.parse().unwrap_or(0.0); let rv:f64=r.parse().unwrap_or(0.0);
            return match *op {"=="=>l==r||(lv==rv),"!="=>l!=r,">="=>lv>=rv,"<="=>lv<=rv,">"=>lv>rv,"<"=>lv<rv,_=>false};
        }
    }
    let t=expr.trim(); !t.is_empty()&&t!="false"&&t!="0"
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
    let output = if cfg!(target_os = "windows") {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", cmd_line]);
        #[cfg(target_os = "windows")]
        if !show_console {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.output()
    } else {
        std::process::Command::new("sh").args(["-c", cmd_line]).output()
    };
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
}

fn exec_cmd_spawn(cmd_line: &str, show_console: bool) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", cmd_line]);
        #[cfg(target_os = "windows")]
        if !show_console {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn().map_err(|e| e.to_string())?;
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

    let verb = wide("runas");
    let file = wide("cmd.exe");
    let params = wide(&format!("/C {cmd_line}"));
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

    let mut cmd = std::process::Command::new("uv");
    cmd.current_dir(&work_dir).arg("run");
    let py = b.python_version.trim();
    if !py.is_empty() {
        cmd.args(["--python", py]);
    }
    if !b.requirements.trim().is_empty() {
        if let Err(e) = std::fs::write(&req_path, &b.requirements) {
            return CmdExecResult { stdout: String::new(), stderr: e.to_string(), exit_code: -1 };
        }
        cmd.arg("--with-requirements").arg(&req_path);
    }
    cmd.arg(&script_path);
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
            stderr: format!("uv introuvable ou impossible a lancer: {e}"),
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

fn capture_image_for_ocr(x: i32, y: i32, width: u32, height: u32, screen: i32) -> Result<image::RgbaImage> {
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

pub fn resolve_expressions_in_text(text: &str, vars: &Vars) -> String {
    let mut s = text.replace("%%", "\x00");
    {
        let mut names: Vec<_> = vars.keys().collect();
        names.sort_by_key(|k| Reverse(k.len()));
        for name in names {
            s = s.replace(&format!("%{name}"), vars[name].as_str());
        }
    }
    s = s.replace('\x00', "%");
    s = eval_curpos_calls(&s);
    s = eval_count_calls(&s, vars);
    s = eval_random_calls(&s);
    s = eval_math_fns(&s, vars);
    s
}
