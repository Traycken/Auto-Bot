//! Block + Graph definitions sent from the frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Default helpers ───────────────────────────────────────────────────────────

fn default_str_0()    -> String { "0".into() }
fn default_str_100()  -> String { "100".into() }
fn default_str_1000() -> String { "1000".into() }
fn default_str_1()    -> String { "1".into() }
fn default_str_3()    -> String { "3".into() }
fn default_str_i()    -> String { "i".into() }
fn default_str_10()   -> String { "10".into() }
fn default_str_fra()  -> String { "fra".into() }
fn default_str_300()  -> String { "300".into() }
fn default_button()   -> MouseButton { MouseButton::Left }
fn default_hex()      -> String { "#FF0000".into() }
fn default_iterations() -> String { "1".into() }
fn default_cooldown_ms() -> String { "250".into() }
fn default_threshold()   -> String { "0.9".into() }
fn default_rnd_mode()    -> String { "int".into() }
fn default_rnd_max()     -> String { "100".into() }
fn default_rnd_seed()    -> String { "42".into() }
fn default_rnd_list()    -> String { "a,b,c".into() }
fn default_result_var()  -> String { "result".into() }
fn default_myvar()       -> String { "myVar".into() }
fn default_expr()        -> String { "0".into() }
fn default_screen()      -> i32   { 0 }
fn default_tolerance()   -> u8    { 10 }

// ── Graph wire format ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub data: Block,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "sourceHandle", default)]
    pub source_handle: Option<String>,
    #[serde(rename = "targetHandle", default)]
    pub target_handle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

impl Graph {
    pub fn adjacency(&self) -> HashMap<String, Vec<(String, String, String)>> {
        let mut adj: HashMap<String, Vec<(String, String, String)>> = HashMap::new();
        for e in &self.edges {
            let sh = e.source_handle.clone().unwrap_or_default();
            let th = e.target_handle.clone().unwrap_or_default();
            adj.entry(e.source.clone()).or_default().push((e.target.clone(), sh, th));
        }
        adj
    }
    pub fn start_id(&self) -> Option<String> {
        self.nodes.iter().find(|n| matches!(n.data, Block::Start)).map(|n| n.id.clone())
    }
    pub fn function_args_id(&self) -> Option<String> {
        self.nodes.iter().find(|n| matches!(n.data, Block::FunctionArgs(_))).map(|n| n.id.clone())
    }
    pub fn node(&self, id: &str) -> Option<&GraphNode> {
        self.nodes.iter().find(|n| n.id == id)
    }
}

// ── FunctionCall arg binding ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallArg {
    #[serde(default)] pub name: String,
    #[serde(default)] pub value: String,
}

// ── Block enum ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Block {
    Start,
    MouseMove(MouseMoveBlock),
    MouseClick(MouseClickBlock),
    MouseScroll(MouseScrollBlock),
    KeyPress(KeyPressBlock),
    TypeText(TypeTextBlock),
    Wait(WaitBlock),
    ForLoop(ForLoopBlock),
    If(IfBlock),
    SetVariable(SetVariableBlock),
    Math(MathBlock),
    Random(RandomBlock),
    PixelColor(PixelColorBlock),
    ImageMatch(ImageMatchBlock),
    Ocr(OcrBlock),
    FunctionArgs(FunctionArgsBlock),
    FunctionReturn(FunctionReturnBlock),
    FunctionCall(FunctionCallBlock),
    ArrayPush(ArrayPushBlock),
    ArrayMerge(ArrayMergeBlock),
    ArrayGet(ArrayGetBlock),
    ArraySearch(ArraySearchBlock),
    ArrayDelete(ArrayDeleteBlock),
    DictAdd(DictAddBlock),
    DictCombine(DictCombineBlock),
    DictFind(DictFindBlock),
    DictRemove(DictRemoveBlock),
    Cmd(CmdBlock),
    Python(PythonBlock),
    Iterations(IterationsBlock),
    #[serde(rename = "for_each", alias = "foreach")]
    ForEach(ForEachBlock),
    Switch(SwitchBlock),
    Console(ConsoleBlock),
    Ia(IaBlock),
    Vpo(VpoBlock),
    Gamepad(GamepadBlock),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationsBlock {
    #[serde(default="default_str_10")] pub count: String,
    #[serde(default)] pub infinite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForEachBlock {
    #[serde(default)] pub collection_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchBlock {
    #[serde(default)] pub expression: String,
    #[serde(default)] pub cases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleBlock {
    #[serde(default)] pub text: String,
}

fn default_ia_mode() -> String { "text".into() }
fn default_ia_api() -> String { "external".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IaBlock {
    #[serde(default = "default_ia_mode")] pub mode: String, // "text" | "image"
    #[serde(default)] pub prompt: String,
    #[serde(default = "default_ia_api")] pub api_mode: String, // "local" | "external"
    #[serde(default)] pub api_key: String,
    #[serde(default)] pub model_name: String,
    #[serde(default)] pub output_var: String,
    #[serde(default)] pub api_url: String,
    #[serde(default)] pub x: String,
    #[serde(default)] pub y: String,
    #[serde(default)] pub width: String,
    #[serde(default)] pub height: String,
    #[serde(default)] pub screen: i32,
    #[serde(default)] pub auto_retry: bool,
    #[serde(default)] pub expected_type: String,
    #[serde(default)] pub expected_schema: String,
}

fn default_gamepad_action() -> String { "button".into() }
fn default_gamepad_stick() -> String { "LX".into() }
fn default_gamepad_trigger() -> String { "LT".into() }
fn default_gamepad_hold() -> String { "100".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamepadBlock {
    /// Action à effectuer : "button" | "stick" | "trigger"
    #[serde(default = "default_gamepad_action")] pub action: String,
    /// Boutons à simuler (séparés par +), ex. "A", "A+B", "UP"
    #[serde(default)] pub buttons: String,
    /// Joystick cible : "LX" | "LY" | "RX" | "RY"
    #[serde(default = "default_gamepad_stick")] pub stick: String,
    /// Gâchette cible : "LT" | "RT"
    #[serde(default = "default_gamepad_trigger")] pub trigger: String,
    /// Valeur : [-32768..32767] pour stick, [0..255] pour trigger
    #[serde(default = "default_str_0")] pub value: String,
    /// Durée de maintien en ms (mode button)
    #[serde(default = "default_gamepad_hold")] pub hold_ms: String,
}

fn default_vpo_threshold() -> String { "0.5".into() }
fn default_vpo_mode() -> String { "detect".into() }
fn default_vpo_model() -> String { "yolov8n.onnx".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpoBlock {
    #[serde(default)] pub class_name: String,
    #[serde(default = "default_vpo_threshold")] pub threshold: String,
    #[serde(default)] pub output_var: String,
    #[serde(default)] pub x: String,
    #[serde(default)] pub y: String,
    #[serde(default)] pub width: String,
    #[serde(default)] pub height: String,
    #[serde(default)] pub screen: i32,
    #[serde(default = "default_vpo_model")] pub model_name: String,
    #[serde(default = "default_vpo_mode")] pub mode: String, // "detect" | "classify"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrayPushBlock {
    #[serde(default)] pub array_var: String,
    #[serde(default)] pub values: String,
    #[serde(default)] pub position: String, // "back" | "front"
    #[serde(default)] pub unique: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrayMergeBlock {
    #[serde(default)] pub array_vars: String,
    #[serde(default)] pub output_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrayGetBlock {
    #[serde(default)] pub array_var: String,
    #[serde(default)] pub index: String,
    #[serde(default)] pub output_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArraySearchBlock {
    #[serde(default)] pub array_var: String,
    #[serde(default)] pub values: String,
    #[serde(default)] pub mode: String, // "first" | "last" | "all"
    #[serde(default)] pub output_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArrayDeleteBlock {
    #[serde(default)] pub array_var: String,
    #[serde(default)] pub index: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictKeyValue {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictAddBlock {
    #[serde(default)] pub dict_var: String,
    #[serde(default)] pub pairs: Vec<DictKeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictCombineBlock {
    #[serde(default)] pub dict_vars: String,
    #[serde(default)] pub output_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictFindBlock {
    #[serde(default)] pub dict_var: String,
    #[serde(default)] pub key: String,
    #[serde(default)] pub output_var: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictRemoveBlock {
    #[serde(default)] pub dict_var: String,
    #[serde(default)] pub key: String,
}

// ── Block structs — tous les champs ont #[serde(default)] ────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseMoveBlock {
    #[serde(default="default_str_0")]   pub x: String,
    #[serde(default="default_str_0")]   pub y: String,
    #[serde(default="default_screen")]  pub screen: i32,
    #[serde(default)]                   pub relative: bool,
    #[serde(default="default_str_100")] pub travel_ms: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseClickBlock {
    #[serde(default="default_str_0")]   pub x: String,
    #[serde(default="default_str_0")]   pub y: String,
    #[serde(default="default_screen")]  pub screen: i32,
    #[serde(default="default_button")]  pub button: MouseButton,
    #[serde(default)]                   pub double_click: bool,
    #[serde(default="default_str_100")] pub travel_ms: String,
    #[serde(default="default_str_0")]   pub delay_after_ms: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton { Left, Right, Middle }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseScrollBlock {
    #[serde(default="default_str_0")]   pub x: String,
    #[serde(default="default_str_0")]   pub y: String,
    #[serde(default="default_screen")]  pub screen: i32,
    #[serde(default="default_str_0")]   pub delta_x: String,
    #[serde(default="default_str_3")]   pub delta_y: String,
    #[serde(default="default_str_0")]   pub travel_ms: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyPressBlock {
    #[serde(default)] pub key_combo: String,
    #[serde(default="default_str_0")] pub hold_ms: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeTextBlock {
    #[serde(default)] pub text: String,
    #[serde(default="default_str_0")] pub delay_between_chars_ms: String,
}

fn default_str_minus_1() -> String { "-1".into() }
fn default_str_duration() -> String { "duration".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitBlock {
    #[serde(default="default_str_1000")] pub duration_ms: String,
    #[serde(default="default_str_duration")] pub mode: String, // "duration" | "datetime"
    #[serde(default="default_str_minus_1")] pub year: String,
    #[serde(default="default_str_minus_1")] pub month: String,
    #[serde(default="default_str_minus_1")] pub day: String,
    #[serde(default="default_str_minus_1")] pub hour: String,
    #[serde(default="default_str_minus_1")] pub minute: String,
    #[serde(default="default_str_minus_1")] pub second: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForLoopBlock {
    #[serde(default="default_str_i")]   pub var_name: String,
    #[serde(default="default_str_0")]   pub from: String,
    #[serde(default="default_str_10")]  pub to: String,
    #[serde(default="default_str_1")]   pub step: String,
    #[serde(default)]                   pub infinite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfBlock {
    #[serde(default)] pub condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariablePair {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetVariableBlock {
    #[serde(default="default_myvar")] pub name: String,
    #[serde(default="default_str_0")] pub value: String,
    #[serde(default)] pub vars: Vec<VariablePair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MathBlock {
    #[serde(default="default_result_var")] pub target_var: String,
    #[serde(default="default_expr")]       pub expression: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrBlock {
    #[serde(default="default_str_0")]   pub x: String,
    #[serde(default="default_str_0")]   pub y: String,
    #[serde(default="default_str_300")] pub width: String,
    #[serde(default="default_str_100")] pub height: String,
    #[serde(default="default_screen")]  pub screen: i32,
    #[serde(default="default_str_fra")] pub lang: String,
    #[serde(default)]                   pub output_var: String,
    #[serde(default="default_iterations")]   pub iterations: String,
    #[serde(default="default_cooldown_ms")]  pub cooldown_ms: String,
    #[serde(default)]                   pub match_text: String,
    #[serde(default)]                   pub match_case: bool,
    #[serde(default)]                   pub match_whole_word: bool,
    #[serde(default)]                   pub use_regex: bool,
    #[serde(default)]                   pub tolerance: u8, // 0-100% edit distance tolerance
    #[serde(default)]                   pub infinite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PixelCoordinate {
    #[serde(default)] pub x: String,
    #[serde(default)] pub y: String,
    #[serde(default)] pub expected_hex: String,
    #[serde(default)] pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PixelColorBlock {
    #[serde(default)]                        pub search_mode: String,
    #[serde(default="default_str_0")]       pub x: String,
    #[serde(default="default_str_0")]       pub y: String,
    #[serde(default="default_str_100")]     pub region_w: String,
    #[serde(default="default_str_100")]     pub region_h: String,
    #[serde(default="default_screen")]      pub screen: i32,
    #[serde(default)]                       pub color_format: String,
    #[serde(default)]                       pub expected_hexes: Vec<String>,
    #[serde(default="default_hex")]         pub expected_hex: String,
    #[serde(default)]                       pub expected_r: u8,
    #[serde(default)]                       pub expected_g: u8,
    #[serde(default)]                       pub expected_b: u8,
    #[serde(default="default_tolerance")]   pub tolerance: u8,
    #[serde(default)]                       pub output_var: String,
    #[serde(default="default_iterations")]  pub iterations: String,
    #[serde(default="default_cooldown_ms")] pub cooldown_ms: String,
    #[serde(default)]                       pub output_mode: String,
    #[serde(default)]                       pub infinite: bool,
    #[serde(default)]                       pub pixels: Vec<PixelCoordinate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMatchBlock {
    #[serde(default)]                        pub templates_b64: Vec<String>,
    #[serde(default="default_str_0")]        pub region_x: String,
    #[serde(default="default_str_0")]        pub region_y: String,
    #[serde(default="default_str_300")]      pub region_w: String,
    #[serde(default="default_str_300")]      pub region_h: String,
    #[serde(default="default_screen")]       pub screen: i32,
    #[serde(default="default_threshold")]    pub threshold: String,
    #[serde(default="default_iterations")]   pub iterations: String,
    #[serde(default="default_cooldown_ms")]  pub cooldown_ms: String,
    #[serde(default)]                        pub output_var: String,
    #[serde(default = "default_match_first")] pub match_mode: String,
    #[serde(default)]                        pub output_mode: String,
    #[serde(default)]                        pub infinite: bool,
}

fn default_match_first() -> String { "first".into() }
fn default_cmd_return() -> String { "CMDReturn".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmdBlock {
    #[serde(default)] pub command: String,
    #[serde(default = "default_cmd_return")] pub output_var: String,
    #[serde(default = "default_wait_true")] pub wait: bool,
    #[serde(default)] pub administrator: bool,
    #[serde(default)] pub echo: bool,
}

fn default_wait_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonGlobal {
    #[serde(default)] pub name: String,
    #[serde(default)] pub value: String,
}

fn default_python_version() -> String { "3.12".into() }
fn default_python_output() -> String { "PythonReturn".into() }

fn default_interpreter_mode() -> String { "uv".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonBlock {
    #[serde(default)] pub script: String,
    #[serde(default)] pub requirements: String,
    #[serde(default = "default_python_version")] pub python_version: String,
    #[serde(default)] pub globals: Vec<PythonGlobal>,
    #[serde(default = "default_python_output")] pub output_var: String,
    #[serde(default = "default_interpreter_mode")] pub interpreter_mode: String, // "uv" | "manual"
    #[serde(default)] pub python_path: String,
    #[serde(default)] pub pip_path: String,
    #[serde(default)] pub python_env_dir: String,
    #[serde(default)] pub python_env_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RandomBlock {
    #[serde(default="default_rnd_mode")]  pub mode: String,
    #[serde(default="default_str_0")]     pub min: String,
    #[serde(default="default_rnd_max")]   pub max: String,
    #[serde(default)]                     pub use_seed: bool,
    #[serde(default="default_rnd_seed")]  pub seed: String,
    #[serde(default="default_rnd_list")]  pub list_items: String,
    #[serde(default)]                     pub output_var: String,
}

// ── Function-related blocks ───────────────────────────────────────────────────

/// An argument definition with optional default value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArgDef {
    #[serde(default)] pub name: String,
    #[serde(default)] pub default_value: String,
}

impl Default for ArgDef {
    fn default() -> Self { ArgDef { name: String::new(), default_value: String::new() } }
}

/// Deserialise args that may be either plain strings (old format) or ArgDef objects.
fn deser_args<'de, D>(deserializer: D) -> Result<Vec<ArgDef>, D::Error>
where D: serde::Deserializer<'de>
{
    use serde::de::{SeqAccess, Visitor};
    use std::fmt;

    struct ArgsVisitor;
    impl<'de> Visitor<'de> for ArgsVisitor {
        type Value = Vec<ArgDef>;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "array of strings or ArgDef objects") }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut out = vec![];
            while let Some(val) = seq.next_element::<serde_json::Value>()? {
                let def = match val {
                    serde_json::Value::String(s) => ArgDef { name: s, default_value: String::new() },
                    obj => serde_json::from_value::<ArgDef>(obj).unwrap_or_default(),
                };
                out.push(def);
            }
            Ok(out)
        }
    }
    deserializer.deserialize_seq(ArgsVisitor)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionArgsBlock {
    #[serde(default, deserialize_with = "deser_args")] pub args: Vec<ArgDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionReturnBlock {
    #[serde(default)] pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCallBlock {
    #[serde(default)] pub function_name: String,
    #[serde(default)] pub call_args: Vec<CallArg>,
    #[serde(default)] pub return_var: String,
}

// ── Expression evaluator ──────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn eval_expr(expr: &str, vars: &HashMap<String, String>) -> f64 {
    let resolved = expr
        .replace("%%", "\x00")
        .split('%')
        .enumerate()
        .map(|(i, part)| {
            if i == 0 { return part.to_string(); }
            let end = part.find(|c: char| !c.is_alphanumeric() && c != '_').unwrap_or(part.len());
            let name = &part[..end];
            let rest = &part[end..];
            let value = vars.get(name).map(|s| s.as_str()).unwrap_or("0");
            format!("{}{}", value, rest)
        })
        .collect::<String>()
        .replace('\x00', "%");

    let trimmed = resolved.trim();
    if trimmed.chars().all(|c| c.is_ascii_digit() || " +-*/.()".contains(c)) {
        tiny_eval(trimmed).unwrap_or(0.0)
    } else {
        trimmed.parse::<f64>().unwrap_or(0.0)
    }
}

pub fn interpolate_text(text: &str, vars: &HashMap<String, String>) -> String {
    crate::engine::resolve_expressions_in_text(text, vars)
}

// ── Tiny recursive-descent evaluator ─────────────────────────────────────────

#[allow(dead_code)]
pub fn tiny_eval(expr: &str) -> Option<f64> {
    let b = expr.as_bytes();
    let (v, pos) = parse_add(b, 0)?;
    let pos = skip_ws(b, pos);
    if pos == b.len() { Some(v) } else { None }
}

fn skip_ws(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t') { i += 1; }
    i
}
fn parse_add(b: &[u8], i: usize) -> Option<(f64, usize)> {
    let (mut lhs, mut i) = parse_mul(b, i)?;
    loop {
        let j = skip_ws(b, i);
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            let op = b[j]; let (rhs, k) = parse_mul(b, j+1)?;
            lhs = if op==b'+' { lhs+rhs } else { lhs-rhs }; i = k;
        } else { return Some((lhs, i)); }
    }
}
fn parse_mul(b: &[u8], i: usize) -> Option<(f64, usize)> {
    let (mut lhs, mut i) = parse_unary(b, i)?;
    loop {
        let j = skip_ws(b, i);
        if j < b.len() && (b[j] == b'*' || b[j] == b'/') {
            let op = b[j]; let (rhs, k) = parse_unary(b, j+1)?;
            lhs = if op==b'*' { lhs*rhs } else if rhs!=0.0 { lhs/rhs } else { 0.0 }; i = k;
        } else { return Some((lhs, i)); }
    }
}
fn parse_unary(b: &[u8], i: usize) -> Option<(f64, usize)> {
    let i = skip_ws(b, i);
    if i < b.len() && b[i] == b'-' { let (v, j) = parse_atom(b, i+1)?; return Some((-v, j)); }
    parse_atom(b, i)
}
fn parse_atom(b: &[u8], i: usize) -> Option<(f64, usize)> {
    let i = skip_ws(b, i);
    if i >= b.len() { return None; }
    if b[i] == b'(' {
        let (v, j) = parse_add(b, i+1)?;
        let j = skip_ws(b, j);
        if j < b.len() && b[j] == b')' { return Some((v, j+1)); }
        return None;
    }
    let start = i; let mut j = i;
    while j < b.len() && (b[j].is_ascii_digit() || b[j] == b'.') { j += 1; }
    if j == start { return None; }
    let s = std::str::from_utf8(&b[start..j]).ok()?;
    Some((s.parse().ok()?, j))
}
