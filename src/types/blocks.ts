export type MouseButton   = "left" | "right" | "middle";
export type ColorFormat   = "hex" | "rgb" | "hsv";
export type RandomMode    = "int" | "float" | "bool" | "str" | "list";

// ── Mouse ─────────────────────────────────────────────────────────────────────

export interface MouseMoveBlock {
  kind: "mouse_move";
  x: string; y: string; screen: number; relative: boolean; travel_ms: string;
}
export interface MouseClickBlock {
  kind: "mouse_click";
  x: string; y: string; screen: number; button: MouseButton;
  double_click: boolean; travel_ms: string; delay_after_ms: string;
}
export interface MouseScrollBlock {
  kind: "mouse_scroll";
  x: string; y: string; screen: number; delta_x: string; delta_y: string; travel_ms: string;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

export interface KeyPressBlock  { kind: "key_press";  key_combo: string; hold_ms: string; }
export interface TypeTextBlock  { kind: "type_text";  text: string; delay_between_chars_ms: string; }

// ── Flow ──────────────────────────────────────────────────────────────────────

export interface WaitBlock         { kind: "wait";         duration_ms: string; }
export interface ForLoopBlock      { kind: "for_loop";     var_name: string; from: string; to: string; step: string; }
export interface IfBlock           { kind: "if";           condition: string; }
export interface SetVariableBlock  { kind: "set_variable"; name: string; value: string; vars?: { name: string; value: string }[]; }
export interface MathBlock         { kind: "math";         target_var: string; expression: string; }
export interface StartBlock        { kind: "start"; }

// ── Function graph special nodes ──────────────────────────────────────────────

export interface FunctionArgsBlock {
  kind: "function_args";
  args: string[];
}

export interface FunctionReturnBlock {
  kind: "function_return";
  value: string;
}

// ── Function call (main graph) ────────────────────────────────────────────────

export interface FunctionCallArg {
  name: string;
  value: string;
}

export interface FunctionCallBlock {
  kind: "function_call";
  function_name: string;
  call_args: FunctionCallArg[];
  return_var: string;
}

// ── Random ────────────────────────────────────────────────────────────────────

export interface RandomBlock {
  kind: "random";
  mode: RandomMode; min: string; max: string;
  use_seed: boolean; seed: string; list_items: string; output_var: string;
}

// ── Vision ────────────────────────────────────────────────────────────────────

export interface PixelColorBlock {
  kind: "pixel_color";
  x: string; y: string; screen: number; color_format: ColorFormat;
  expected_hex: string; expected_r: number; expected_g: number; expected_b: number;
  expected_h: number; expected_s: number; expected_v: number;
  tolerance: number; output_var: string;
  iterations: string; cooldown_ms: string;
}
export interface ImageMatchBlock {
  kind: "image_match";
  template_b64: string; region_x: string; region_y: string; region_w: string; region_h: string;
  screen: number; threshold: string; iterations: string; cooldown_ms: string; output_var: string;
  match_mode: "first" | "all";
}
export interface OcrBlock {
  kind: "ocr";
  x: string; y: string; width: string; height: string; screen: number; lang: string; output_var: string;
  iterations: string; cooldown_ms: string;
  match_text: string; match_case: boolean; match_whole_word: boolean; use_regex: boolean;
  tolerance: number;
}

// ── Array ─────────────────────────────────────────────────────────────────────

export interface ArrayPushBlock {
  kind: "array_push";
  array_var: string;
  values: string;          // comma-separated or single value / %var
  position: "back" | "front";
  unique: boolean;
}
export interface ArrayMergeBlock {
  kind: "array_merge";
  array_vars: string;      // comma-separated variable names
  output_var: string;
}
export interface ArrayGetBlock {
  kind: "array_get";
  array_var: string;
  index: string;
  output_var: string;
}
export interface ArraySearchBlock {
  kind: "array_search";
  array_var: string;
  values: string;          // comma-separated values to search
  mode: "first" | "last" | "all";
  output_var: string;
}
export interface ArrayDeleteBlock {
  kind: "array_delete";
  array_var: string;
  index: string;
}

// ── Dict ──────────────────────────────────────────────────────────────────────

export interface DictKeyValue { key: string; value: string; }

export interface DictAddBlock {
  kind: "dict_add";
  dict_var: string;
  pairs: DictKeyValue[];
}
export interface DictCombineBlock {
  kind: "dict_combine";
  dict_vars: string;       // comma-separated variable names
  output_var: string;
}
export interface DictFindBlock {
  kind: "dict_find";
  dict_var: string;
  key: string;
  output_var: string;
}
export interface DictRemoveBlock {
  kind: "dict_remove";
  dict_var: string;
  key: string;
}

export interface CmdBlock {
  kind: "cmd";
  command: string;
  output_var: string;
  wait: boolean;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type Block =
  | StartBlock
  | MouseMoveBlock | MouseClickBlock | MouseScrollBlock
  | KeyPressBlock  | TypeTextBlock
  | WaitBlock | ForLoopBlock | IfBlock | MathBlock | SetVariableBlock
  | RandomBlock
  | PixelColorBlock | ImageMatchBlock | OcrBlock
  | FunctionArgsBlock | FunctionReturnBlock
  | FunctionCallBlock
  | ArrayPushBlock | ArrayMergeBlock | ArrayGetBlock | ArraySearchBlock | ArrayDeleteBlock
  | DictAddBlock | DictCombineBlock | DictFindBlock | DictRemoveBlock
  | CmdBlock;

export type BlockKind = Block["kind"];

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface BlockMeta {
  kind: BlockKind;
  label: string;
  category: "special" | "mouse" | "keyboard" | "flow" | "vision" | "logic" | "function" | "array" | "dict" | "system";
  color: string;
  icon: string;
  defaultData: Omit<Block, "kind">;
  paletteHidden?: boolean;
  functionOnly?: boolean;
  mainOnly?: boolean;
}

export const BLOCK_CATALOG: BlockMeta[] = [
  // ── Special ──────────────────────────────────────────────────────────────
  { kind: "start",    label: "Départ",            category: "special",   color: "#22C55E", icon: "ti-player-play",   paletteHidden: true, mainOnly: true,     defaultData: {} },
  { kind: "function_args",   label: "Arguments",  category: "special",   color: "#22C55E", icon: "ti-input-check",   paletteHidden: true, functionOnly: true, defaultData: { args: [] } },
  { kind: "function_return", label: "Retour",     category: "special",   color: "#EF9F27", icon: "ti-corner-up-left",paletteHidden: true, functionOnly: true, defaultData: { value: "" } },

  // ── Mouse ─────────────────────────────────────────────────────────────────
  { kind: "mouse_move",   label: "Déplacement souris", category: "mouse",    color: "#E84C1E", icon: "ti-arrows-move",
    defaultData: { x:"0", y:"0", screen:0, relative:false, travel_ms:"100" } },
  { kind: "mouse_click",  label: "Clic souris",         category: "mouse",    color: "#E84C1E", icon: "ti-mouse",
    defaultData: { x:"0", y:"0", screen:0, button:"left" as MouseButton, double_click:false, travel_ms:"100", delay_after_ms:"0" } },
  { kind: "mouse_scroll", label: "Défilement",          category: "mouse",    color: "#E84C1E", icon: "ti-arrow-autofit-height",
    defaultData: { x:"0", y:"0", screen:0, delta_x:"0", delta_y:"3", travel_ms:"0" } },

  // ── Keyboard ──────────────────────────────────────────────────────────────
  { kind: "key_press",    label: "Touche",  category: "keyboard", color: "#378ADD", icon: "ti-keyboard",
    defaultData: { key_combo:"", hold_ms:"0" } },
  { kind: "type_text",    label: "Texte",   category: "keyboard", color: "#378ADD", icon: "ti-cursor-text",
    defaultData: { text:"", delay_between_chars_ms:"0" } },

  // ── Flow ──────────────────────────────────────────────────────────────────
  { kind: "wait",         label: "Attendre",          category: "flow", color: "#7F77DD", icon: "ti-clock-pause",
    defaultData: { duration_ms:"1000" } },
  { kind: "for_loop",     label: "Boucle FOR",         category: "flow", color: "#7F77DD", icon: "ti-arrows-right-left",
    defaultData: { var_name:"i", from:"0", to:"10", step:"1" } },
  { kind: "math",         label: "Math",               category: "flow", color: "#7F77DD", icon: "ti-calculator",
    defaultData: { target_var:"result", expression:"%i * 2" } },
  { kind: "set_variable", label: "Variable (locale)",  category: "flow", color: "#7F77DD", icon: "ti-variable",
    defaultData: { name:"myVar", value:"0", vars: [] } },
  { kind: "random",       label: "Aléatoire",          category: "flow", color: "#D4537E", icon: "ti-dice",
    defaultData: { mode:"int" as RandomMode, min:"0", max:"100", use_seed:false, seed:"42", list_items:"a,b,c", output_var:"rnd" } },

  // ── Logic ─────────────────────────────────────────────────────────────────
  { kind: "if", label: "Si (If)", category: "logic", color: "#EF9F27", icon: "ti-git-branch",
    defaultData: { condition:"%myVar > 0" } },

  // ── Vision ────────────────────────────────────────────────────────────────
  { kind: "pixel_color",  label: "Couleur pixel",     category: "vision", color: "#1D9E75", icon: "ti-color-picker",
    defaultData: { x:"0", y:"0", screen:0, color_format:"hex" as ColorFormat, expected_hex:"#FF0000", expected_r:255, expected_g:0, expected_b:0, expected_h:0, expected_s:100, expected_v:100, tolerance:10, output_var:"pixelMatch", iterations:"1", cooldown_ms:"250" } },
  { kind: "image_match",  label: "Comparateur image", category: "vision", color: "#1D9E75", icon: "ti-photo-search",
    defaultData: { template_b64:"", region_x:"0", region_y:"0", region_w:"400", region_h:"300", screen:0, threshold:"0.9", iterations:"1", cooldown_ms:"250", output_var:"imgMatch", match_mode:"first" as const } },
  { kind: "ocr",          label: "OCR",               category: "vision", color: "#1D9E75", icon: "ti-scan",
    defaultData: { x:"0", y:"0", width:"300", height:"100", screen:0, lang:"fra", output_var:"ocrText", iterations:"1", cooldown_ms:"250", match_text:"", match_case:false, match_whole_word:false, use_regex:false, tolerance:0 } },

  // ── Array ─────────────────────────────────────────────────────────────────
  { kind: "array_push",   label: "Push Array",    category: "array", color: "#0EA5E9", icon: "ti-list-details",
    defaultData: { array_var:"myArray", values:"", position:"back" as const, unique:false } },
  { kind: "array_merge",  label: "Merge Arrays",  category: "array", color: "#0EA5E9", icon: "ti-arrows-join",
    defaultData: { array_vars:"arr1,arr2", output_var:"merged" } },
  { kind: "array_get",    label: "Get Index",     category: "array", color: "#0EA5E9", icon: "ti-list-search",
    defaultData: { array_var:"myArray", index:"0", output_var:"item" } },
  { kind: "array_search", label: "Chercher",      category: "array", color: "#0EA5E9", icon: "ti-search",
    defaultData: { array_var:"myArray", values:"", mode:"first" as const, output_var:"idx" } },
  { kind: "array_delete", label: "Suppr. Index",  category: "array", color: "#0EA5E9", icon: "ti-list-minus",
    defaultData: { array_var:"myArray", index:"0" } },

  // ── Dict ──────────────────────────────────────────────────────────────────
  { kind: "dict_add",     label: "Add Dict",      category: "dict", color: "#F59E0B", icon: "ti-table-plus",
    defaultData: { dict_var:"myDict", pairs:[{ key:"", value:"" }] } },
  { kind: "dict_combine", label: "Combine Dicts", category: "dict", color: "#F59E0B", icon: "ti-layers-union",
    defaultData: { dict_vars:"dict1,dict2", output_var:"combined" } },
  { kind: "dict_find",    label: "Find Key",      category: "dict", color: "#F59E0B", icon: "ti-table-search",
    defaultData: { dict_var:"myDict", key:"", output_var:"value" } },
  { kind: "dict_remove",  label: "Remove Key",    category: "dict", color: "#F59E0B", icon: "ti-table-minus",
    defaultData: { dict_var:"myDict", key:"" } },

  // ── System ────────────────────────────────────────────────────────────────
  { kind: "cmd", label: "CMD", category: "system", color: "#64748B", icon: "ti-terminal-2",
    defaultData: { command:"", output_var:"CMDReturn", wait:true } },

  // ── Function ──────────────────────────────────────────────────────────────
  { kind: "function_call", label: "Appel Fonction", category: "function", color: "#A855F7", icon: "ti-function",
    mainOnly: false,
    defaultData: { function_name:"", call_args:[], return_var:"" } },
];
