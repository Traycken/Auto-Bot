/**
 * SmartInput — universal expression input with:
 * - %varName autocomplete from global variables
 * - random(min,max[,seed]) / random([a,b,c][,seed]) functions
 * - round(%v,d) / ceil(%v,d) / floor(%v,d) math functions
 * - Math expression preview
 * - F8 cursor capture for X/Y fields
 */
import { useState, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  capture?: boolean;
  multiline?: boolean;
  onCaptureY?: (y: number) => void;
}

// ── Expression evaluator (frontend preview only) ──────────────────────────────

function evalPreview(expr: string, vars: Record<string, string>): string | null {
  if (!expr.trim()) return null;
  try {
    // Substitute %var
    let resolved = expr.replace(/%%/g, "\x00").replace(/%(\w+)/g, (_, n) => vars[n] ?? "0").replace(/\x00/g, "%");
    // Substitute round/ceil/floor for preview
    resolved = resolved
      .replace(/round\(([^,)]+),?\s*(\d*)\)/g, (_, v, d) => String(Math.round(parseFloat(v) * Math.pow(10, +d || 0)) / Math.pow(10, +d || 0)))
      .replace(/ceil\(([^,)]+),?\s*(\d*)\)/g,  (_, v, d) => String(Math.ceil(parseFloat(v) * Math.pow(10, +d || 0)) / Math.pow(10, +d || 0)))
      .replace(/floor\(([^,)]+),?\s*(\d*)\)/g, (_, v, d) => String(Math.floor(parseFloat(v) * Math.pow(10, +d || 0)) / Math.pow(10, +d || 0)));
    // random preview
    resolved = resolved.replace(/random\([^)]*\)/g, "?");
    if (!/^[\d\s+\-*/().?]+$/.test(resolved.trim())) return null;
    if (resolved.includes("?")) return "= ?";
    const result = Function(`"use strict"; return (${resolved})`)() as number;
    if (isNaN(result)) return null;
    if (resolved.trim() === expr.trim().replace(/%(\w+)/g, (_, n) => vars[n] ?? "0")) return null;
    return `= ${Math.round(result * 10000) / 10000}`;
  } catch { return null; }
}

// ── Function snippets shown in dropdown ───────────────────────────────────────

const FN_SNIPPETS = [
  { label: "random(min,max)",       insert: "random(0,100)",            desc: "entier aléatoire" },
  { label: "random(min,max,seed)",  insert: "random(0,100,42)",         desc: "avec seed" },
  { label: "random(true,false)",    insert: "random(true,false)",        desc: "booléen aléatoire" },
  { label: "random([a,b,c])",       insert: "random([a,b,c])",          desc: "depuis une liste" },
  { label: "round(val,digits)",     insert: "round(%myVar,2)",          desc: "arrondi" },
  { label: "ceil(val,digits)",      insert: "ceil(%myVar,0)",           desc: "arrondi supérieur" },
  { label: "floor(val,digits)",     insert: "floor(%myVar,0)",          desc: "arrondi inférieur" },
];

export function SmartInput({ label, value, onChange, placeholder, capture, multiline, onCaptureY }: Props) {
  const { variables } = useEditorStore();
  const varsMap = Object.fromEntries(variables.map((v) => [v.name, v.value]));

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestType, setSuggestType] = useState<"var" | "fn">("var");
  const [suggestQuery, setSuggestQuery] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const preview = evalPreview(value, varsMap);
  const hasVarRef = /%\w/.test(value);

  // ── Change handler ──────────────────────────────────────────────────────────
  const handleChange = (v: string) => {
    onChange(v);
    // Detect %var trigger
    const varMatch = v.match(/%(\w*)$/);
    if (varMatch) {
      setSuggestQuery(varMatch[1].toLowerCase());
      setSuggestType("var");
      setShowSuggest(true);
      return;
    }
    // Detect fn( trigger
    const fnMatch = v.match(/(\w*)[\s(]*$/);
    if (fnMatch && ["random", "round", "ceil", "floor"].some(f => f.startsWith(fnMatch[1].toLowerCase()) && fnMatch[1].length >= 2)) {
      setSuggestQuery(fnMatch[1].toLowerCase());
      setSuggestType("fn");
      setShowSuggest(true);
      return;
    }
    setShowSuggest(false);
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "F8" && capture && focused) { e.preventDefault(); e.stopPropagation(); doCapture(); }
    if (e.key === "Escape") setShowSuggest(false);
    if (e.key === "Tab" && showSuggest) { e.preventDefault(); insertFirst(); }
  };

  const insertFirst = () => {
    if (suggestType === "var" && filteredVars.length > 0) insertVar(filteredVars[0].name);
    if (suggestType === "fn"  && filteredFns.length > 0)  insertFn(filteredFns[0].insert);
  };

  // ── Cursor capture ──────────────────────────────────────────────────────────
  const doCapture = async () => {
    setCapturing(true); setShowSuggest(false);
    try {
      const pos = await invoke<{ x: number; y: number }>("get_cursor_position");
      onChange(String(pos.x));
      if (onCaptureY) onCaptureY(pos.y);
    } catch {
      const raw = prompt("[DEV] Position X:");
      if (raw !== null) { onChange(raw); if (onCaptureY) { const ry = prompt("[DEV] Position Y:"); if (ry) onCaptureY(Number(ry)); } }
    } finally { setCapturing(false); inputRef.current?.focus(); }
  };

  // ── Insert helpers ──────────────────────────────────────────────────────────
  const insertVar = (name: string) => { onChange(value.replace(/%(\w*)$/, `%${name} `)); setShowSuggest(false); setTimeout(() => inputRef.current?.focus(), 0); };
  const insertFn  = (snippet: string) => { const newVal = value.replace(/(\w*)[\s]*$/, "") + snippet; onChange(newVal); setShowSuggest(false); setTimeout(() => inputRef.current?.focus(), 0); };

  const filteredVars = variables.filter(v => v.name.toLowerCase().startsWith(suggestQuery));
  const filteredFns  = FN_SNIPPETS.filter(f => f.label.toLowerCase().startsWith(suggestQuery));

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "4px 8px",
    paddingRight: capture ? 28 : preview ? 50 : 8,
    fontSize: 11, fontFamily: "monospace",
    background: capturing ? "#0d1f14" : focused ? "#161618" : "#111113",
    border: `0.5px solid ${capturing ? "#22C55E" : focused ? "#3a3a3e" : "#2a2a2e"}`,
    borderRadius: 5, color: "#d0d0d0", outline: "none",
    resize: multiline ? "vertical" as const : "none" as const,
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ marginBottom: 9, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#555" }}>
          {label}{hasVarRef && <span style={{ color: "#c792ea", marginLeft: 4 }}>%</span>}
        </span>
        {capture && <span style={{ fontSize: 8, color: "#2a2a2e" }}>F8</span>}
      </div>

      <div style={{ position: "relative" }}>
        {multiline ? (
          <textarea ref={inputRef as React.Ref<HTMLTextAreaElement>} value={value}
            onChange={e => handleChange(e.target.value)} onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTimeout(() => setShowSuggest(false), 150); }}
            placeholder={placeholder ?? "valeur, %variable, ou random(...)"}
            rows={3} style={inputStyle} />
        ) : (
          <input ref={inputRef as React.Ref<HTMLInputElement>} type="text" value={value}
            onChange={e => handleChange(e.target.value)} onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTimeout(() => setShowSuggest(false), 150); }}
            placeholder={placeholder ?? "valeur, %variable, ou random(...)"}
            style={inputStyle} />
        )}

        {/* Preview */}
        {preview && !capturing && (
          <span style={{ position: "absolute", right: capture ? 30 : 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#1D9E75", pointerEvents: "none", whiteSpace: "nowrap" }}>
            {preview}
          </span>
        )}

        {/* Capture button */}
        {capture && (
          <button onPointerDown={e => { e.preventDefault(); e.stopPropagation(); doCapture(); }} title="F8"
            style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", background: capturing ? "#22C55E22" : "transparent", border: `0.5px solid ${capturing ? "#22C55E" : "#2a2a2e"}`, borderRadius: 4, cursor: "pointer", color: capturing ? "#22C55E" : "#444", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${capturing ? "ti-loader" : "ti-crosshair"}`} style={{ fontSize: 11 }} />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showSuggest && (suggestType === "var" ? filteredVars.length > 0 : filteredFns.length > 0) && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 500, background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: "0 0 6px 6px", boxShadow: "0 6px 20px #000a", overflow: "hidden" }}>

          {suggestType === "var" && filteredVars.slice(0, 6).map((v, i) => (
            <div key={v.name} onPointerDown={e => { e.preventDefault(); insertVar(v.name); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, borderTop: i > 0 ? "0.5px solid #1a1a1e" : "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#222226")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ color: "#c792ea", fontWeight: 600, minWidth: 70 }}>%{v.name}</span>
              <span style={{ color: "#555", fontSize: 10, flex: 1 }}>= {v.value || "—"}</span>
            </div>
          ))}

          {suggestType === "fn" && filteredFns.map((f, i) => (
            <div key={f.label} onPointerDown={e => { e.preventDefault(); insertFn(f.insert); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, borderTop: i > 0 ? "0.5px solid #1a1a1e" : "none" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#222226")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ color: "#EF9F27", fontWeight: 600, minWidth: 120 }}>{f.label}</span>
              <span style={{ color: "#555", fontSize: 10 }}>{f.desc}</span>
            </div>
          ))}

          <div style={{ padding: "3px 10px", background: "#111113", borderTop: "0.5px solid #1a1a1e", fontSize: 9, color: "#333", display: "flex", justifyContent: "space-between" }}>
            <span>Tab = compléter</span>
            <span>%% = signe %</span>
          </div>
        </div>
      )}
    </div>
  );
}
