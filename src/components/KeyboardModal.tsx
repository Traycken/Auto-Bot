/**
 * Full keyboard modal for key combo selection.
 * Supports AZERTY/QWERTY, modifier keys (Shift, Ctrl, Alt, AltGr, Fn, CapsLock),
 * shows shifted/AltGr characters dynamically.
 */
import { useState, useCallback } from "react";
import { t } from "../store/editorStore";

// ── Key definitions ────────────────────────────────────────────────────────────

interface KeyDef {
  code: string;        // internal key name sent to engine
  label: string;       // default display
  shift?: string;      // label when Shift active
  altgr?: string;      // label when AltGr active
  w?: number;          // width multiplier (1 = 1 unit = 40px)
  special?: boolean;   // modifier/special key
  fn?: string;         // FN layer label
}

const AZERTY: KeyDef[][] = [
  // Row 0 — function keys
  [
    { code: "Escape",      label: "Esc",   w: 1,    special: true },
    { code: "F1",          label: "F1",    fn: "F1" }, { code: "F2",  label: "F2",  fn: "F2" },
    { code: "F3",          label: "F3",    fn: "F3" }, { code: "F4",  label: "F4",  fn: "F4" },
    { code: "F5",          label: "F5",    fn: "F5" }, { code: "F6",  label: "F6",  fn: "F6" },
    { code: "F7",          label: "F7",    fn: "F7" }, { code: "F8",  label: "F8",  fn: "F8" },
    { code: "F9",          label: "F9",    fn: "F9" }, { code: "F10", label: "F10", fn: "F10" },
    { code: "F11",         label: "F11",   fn: "F11" }, { code: "F12", label: "F12", fn: "F12" },
    { code: "PrintScreen", label: "Impr",  special: true },
    { code: "ScrollLock",  label: "Arr",   special: true },
    { code: "Pause",       label: "Pause", special: true },
  ],
  // Row 1 — numbers
  [
    { code: "superscript2", label: "²",  shift: "",   altgr: "" },
    { code: "ampersand",    label: "&",  shift: "1",  altgr: "" },
    { code: "eacute",       label: "é",  shift: "2",  altgr: "~" },
    { code: "quotedbl",     label: "\"", shift: "3",  altgr: "#" },
    { code: "apostrophe",   label: "'",  shift: "4",  altgr: "{" },
    { code: "parenleft",    label: "(",  shift: "5",  altgr: "[" },
    { code: "minus",        label: "-",  shift: "6",  altgr: "|" },
    { code: "egrave",       label: "è",  shift: "7",  altgr: "`" },
    { code: "underscore",   label: "_",  shift: "8",  altgr: "\\" },
    { code: "ccedilla",     label: "ç",  shift: "9",  altgr: "^" },
    { code: "agrave",       label: "à",  shift: "0",  altgr: "@" },
    { code: "parenright",   label: ")",  shift: "°",  altgr: "]" },
    { code: "equal",        label: "=",  shift: "+",  altgr: "}" },
    { code: "Backspace",    label: "⌫",  w: 2,        special: true },
  ],
  // Row 2 — AZERTY
  [
    { code: "Tab",    label: "Tab",  w: 1.5, special: true },
    { code: "a",      label: "a",   shift: "A" }, { code: "z",      label: "z",  shift: "Z" },
    { code: "e",      label: "e",   shift: "E", altgr: "€" },
    { code: "r",      label: "r",   shift: "R" }, { code: "t",      label: "t",  shift: "T" },
    { code: "y",      label: "y",   shift: "Y" }, { code: "u",      label: "u",  shift: "U" },
    { code: "i",      label: "i",   shift: "I" }, { code: "o",      label: "o",  shift: "O" },
    { code: "p",      label: "p",   shift: "P" },
    { code: "dead_circumflex", label: "^", shift: "¨", altgr: "" },
    { code: "dollar", label: "$",   shift: "£", altgr: "¤" },
    { code: "Return", label: "⏎",   w: 1.5, special: true },
  ],
  // Row 3 — AZERTY home
  [
    { code: "CapsLock", label: "Caps", w: 1.8, special: true },
    { code: "q",  label: "q",  shift: "Q" }, { code: "s",  label: "s",  shift: "S" },
    { code: "d",  label: "d",  shift: "D" }, { code: "f",  label: "f",  shift: "F" },
    { code: "g",  label: "g",  shift: "G" }, { code: "h",  label: "h",  shift: "H" },
    { code: "j",  label: "j",  shift: "J" }, { code: "k",  label: "k",  shift: "K" },
    { code: "l",  label: "l",  shift: "L" }, { code: "m",  label: "m",  shift: "M" },
    { code: "ugrave",   label: "ù",  shift: "%" },
    { code: "asterisk", label: "*",  shift: "µ" },
  ],
  // Row 4 — bottom letters
  [
    { code: "Shift",      label: "⇧ Shift", w: 2.2, special: true },
    { code: "less",       label: "<",  shift: ">" },
    { code: "w",          label: "w",  shift: "W" }, { code: "x",  label: "x",  shift: "X" },
    { code: "c",          label: "c",  shift: "C" }, { code: "v",  label: "v",  shift: "V" },
    { code: "b",          label: "b",  shift: "B" }, { code: "n",  label: "n",  shift: "N" },
    { code: "comma",      label: ",",  shift: "?" },
    { code: "semicolon",  label: ";",  shift: "." },
    { code: "colon",      label: ":",  shift: "/" },
    { code: "exclam",     label: "!",  shift: "§" },
    { code: "Shift_R",    label: "⇧ Shift", w: 2.2, special: true },
  ],
  // Row 5 — bottom
  [
    { code: "ctrl",   label: "Ctrl",  w: 1.5, special: true },
    { code: "super",  label: "⊞ Win", w: 1.2, special: true },
    { code: "alt",    label: "Alt",   w: 1.2, special: true },
    { code: "space",  label: "Espace", w: 6,  special: false },
    { code: "altgr",  label: "AltGr", w: 1.2, special: true },
    { code: "ctrl_r", label: "Ctrl",  w: 1.2, special: true },
    { code: "ArrowLeft",  label: "◀", special: true },
    { code: "ArrowUp",    label: "▲", special: true },
    { code: "ArrowDown",  label: "▼", special: true },
    { code: "ArrowRight", label: "▶", special: true },
  ],
];

// QWERTY — same structure, different labels
const QWERTY: KeyDef[][] = [
  AZERTY[0], // function row identical
  [
    { code: "grave",     label: "`",  shift: "~" },
    { code: "1",         label: "1",  shift: "!" }, { code: "2",  label: "2",  shift: "@" },
    { code: "3",         label: "3",  shift: "#" }, { code: "4",  label: "4",  shift: "$" },
    { code: "5",         label: "5",  shift: "%" }, { code: "6",  label: "6",  shift: "^" },
    { code: "7",         label: "7",  shift: "&" }, { code: "8",  label: "8",  shift: "*" },
    { code: "9",         label: "9",  shift: "(" }, { code: "0",  label: "0",  shift: ")" },
    { code: "minus",     label: "-",  shift: "_" }, { code: "equal", label: "=", shift: "+" },
    { code: "Backspace", label: "⌫",  w: 2, special: true },
  ],
  [
    { code: "Tab",    label: "Tab", w: 1.5, special: true },
    { code: "q",  label: "q",  shift: "Q" }, { code: "w",  label: "w",  shift: "W" },
    { code: "e",  label: "e",  shift: "E" }, { code: "r",  label: "r",  shift: "R" },
    { code: "t",  label: "t",  shift: "T" }, { code: "y",  label: "y",  shift: "Y" },
    { code: "u",  label: "u",  shift: "U" }, { code: "i",  label: "i",  shift: "I" },
    { code: "o",  label: "o",  shift: "O" }, { code: "p",  label: "p",  shift: "P" },
    { code: "bracketleft",  label: "[",  shift: "{" },
    { code: "bracketright", label: "]",  shift: "}" },
    { code: "backslash",    label: "\\", shift: "|" },
    { code: "Return",       label: "⏎",  w: 1.5, special: true },
  ],
  [
    { code: "CapsLock", label: "Caps", w: 1.8, special: true },
    { code: "a",  label: "a",  shift: "A" }, { code: "s",  label: "s",  shift: "S" },
    { code: "d",  label: "d",  shift: "D" }, { code: "f",  label: "f",  shift: "F" },
    { code: "g",  label: "g",  shift: "G" }, { code: "h",  label: "h",  shift: "H" },
    { code: "j",  label: "j",  shift: "J" }, { code: "k",  label: "k",  shift: "K" },
    { code: "l",  label: "l",  shift: "L" },
    { code: "semicolon", label: ";", shift: ":" }, { code: "apostrophe", label: "'", shift: '"' },
    { code: "Return", label: "⏎", w: 2.3, special: true },
  ],
  [
    { code: "Shift",   label: "⇧ Shift", w: 2.2, special: true },
    { code: "z",  label: "z",  shift: "Z" }, { code: "x",  label: "x",  shift: "X" },
    { code: "c",  label: "c",  shift: "C" }, { code: "v",  label: "v",  shift: "V" },
    { code: "b",  label: "b",  shift: "B" }, { code: "n",  label: "n",  shift: "N" },
    { code: "m",  label: "m",  shift: "M" },
    { code: "comma",  label: ",", shift: "<" }, { code: "period", label: ".", shift: ">" },
    { code: "slash",  label: "/", shift: "?" },
    { code: "Shift_R", label: "⇧ Shift", w: 2.8, special: true },
  ],
  AZERTY[5],
];

// Modifiers that affect key display
const MODIFIERS = ["Shift", "Shift_R", "ctrl", "alt", "altgr", "CapsLock", "super", "ctrl_r"];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onConfirm: (combo: string) => void;
  onClose: () => void;
}

export function KeyboardModal({ onConfirm, onClose }: Props) {
  const [layout, setLayout] = useState<"azerty" | "qwerty">("azerty");
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [combo, setCombo] = useState<string[]>([]);

  const rows = layout === "azerty" ? AZERTY : QWERTY;
  const isShift    = pressed.has("Shift") || pressed.has("Shift_R");
  const isAltGr    = pressed.has("altgr");
  const isCaps     = pressed.has("CapsLock");
  const isCtrl     = pressed.has("ctrl") || pressed.has("ctrl_r");
  const isAlt      = pressed.has("alt");
  const UNIT = 38;

  const getLabel = (k: KeyDef): string => {
    if (isAltGr && k.altgr !== undefined && k.altgr !== "") return k.altgr;
    if (isShift && k.shift !== undefined) return k.shift;
    if (isCaps && k.label.length === 1 && k.label >= "a" && k.label <= "z") return k.label.toUpperCase();
    return k.label;
  };

  const handleKey = useCallback((k: KeyDef) => {
    if (MODIFIERS.includes(k.code)) {
      setPressed(prev => {
        const next = new Set(prev);
        if (next.has(k.code)) next.delete(k.code);
        else next.add(k.code);
        return next;
      });
      return;
    }
    // Build combo string
    const parts: string[] = [];
    if (isCtrl)  parts.push("ctrl");
    if (isAlt)   parts.push("alt");
    if (isAltGr) parts.push("altgr");
    if (isShift || isCaps) parts.push("shift");
    parts.push(k.code);
    const result = parts.join("+");
    setCombo(prev => [...prev, result]);
  }, [isCtrl, isAlt, isAltGr, isShift, isCaps]);

  const removeLastCombo = () => setCombo(prev => prev.slice(0, -1));

  const S = {
    overlay: {
      position: "fixed" as const, inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", display: "flex",
      alignItems: "center", justifyContent: "center",
    },
    modal: {
      background: "#18181b", border: "0.5px solid #2a2a2e",
      borderRadius: 10, padding: 20, minWidth: 680,
      boxShadow: "0 20px 60px #000c",
      fontFamily: "monospace",
    },
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#e0e0e0" }}>{t("kb.select_title", "Sélectionner une touche / combinaison")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["azerty", "qwerty"] as const).map(l => (
              <button key={l} onClick={() => setLayout(l)} style={{
                padding: "3px 10px", fontSize: 11, cursor: "pointer",
                background: layout === l ? "#E84C1E22" : "#111113",
                border: `0.5px solid ${layout === l ? "#E84C1E" : "#2a2a2e"}`,
                borderRadius: 5, color: layout === l ? "#E84C1E" : "#666",
              }}>{l.toUpperCase()}</button>
            ))}
            <button onClick={onClose} style={{ padding: "3px 8px", fontSize: 13, cursor: "pointer", background: "none", border: "0.5px solid #2a2a2e", borderRadius: 5, color: "#666" }}>✕</button>
          </div>
        </div>

        {/* Combo display */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, minHeight: 34 }}>
          <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>Combo:</span>
          <div style={{ flex: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {combo.length === 0
              ? <span style={{ color: "#333", fontSize: 11 }}>{t("kb.click_keys_hint", "— clique sur les touches —")}</span>
              : combo.map((c, i) => (
                  <span key={i} style={{ background: "#E84C1E22", border: "0.5px solid #E84C1E", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#E84C1E" }}>{c}</span>
                ))
            }
          </div>
          {combo.length > 0 && (
            <button onClick={removeLastCombo} style={{ fontSize: 10, padding: "2px 7px", cursor: "pointer", background: "none", border: "0.5px solid #2a2a2e", borderRadius: 4, color: "#666" }}>{t("vars.cancel", "⌫ annuler")}</button>
          )}
        </div>

        {/* Active modifiers display */}
        {pressed.size > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {[...pressed].map(m => (
              <span key={m} style={{ background: "#7F77DD22", border: "0.5px solid #7F77DD", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#7F77DD" }}>{m}</span>
            ))}
          </div>
        )}

        {/* Keyboard SVG-like layout */}
        <div style={{ overflowX: "auto" }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 3, marginBottom: 3 }}>
              {row.map((k) => {
                const isActive = pressed.has(k.code);
                const topLabel = isAltGr && k.altgr ? k.altgr : isShift && k.shift ? k.shift : getLabel(k);
                const botLabel = (!isShift && !isAltGr) ? (k.shift ?? "") : "";
                const w = (k.w ?? 1) * UNIT;

                return (
                  <button
                    key={k.code}
                    onClick={() => handleKey(k)}
                    title={k.code}
                    style={{
                      width: w, minWidth: w, height: UNIT,
                      flexShrink: 0,
                      background: isActive ? "#7F77DD33"
                        : k.special ? "#111113"
                        : "#1a1a1d",
                      border: `0.5px solid ${isActive ? "#7F77DD" : k.special ? "#3a3a3e" : "#2a2a2e"}`,
                      borderRadius: 5,
                      cursor: "pointer",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      padding: "1px 3px", gap: 1,
                      transition: "background 0.1s",
                      position: "relative" as const,
                    }}
                  >
                    {k.altgr && (
                      <span style={{ position: "absolute", top: 2, right: 4, fontSize: 7, color: "#1D9E75", lineHeight: 1 }}>
                        {k.altgr}
                      </span>
                    )}
                    <span style={{ fontSize: w > 50 ? 11 : 10, color: k.special ? "#aaa" : "#d0d0d0", fontWeight: k.special ? 500 : 400, lineHeight: 1 }}>
                      {topLabel}
                    </span>
                    {botLabel && (
                      <span style={{ fontSize: 8, color: "#555", lineHeight: 1 }}>{botLabel}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Confirm / Clear */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={() => { setCombo([]); setPressed(new Set()); }} style={{ padding: "6px 14px", fontSize: 11, cursor: "pointer", background: "none", border: "0.5px solid #2a2a2e", borderRadius: 6, color: "#666", fontFamily: "monospace" }}>
            {t("kb.clear", "Effacer")}
          </button>
          <button
            onClick={() => { if (combo.length > 0) { onConfirm(combo.join(",")); onClose(); } }}
            disabled={combo.length === 0}
            style={{ padding: "6px 18px", fontSize: 11, cursor: combo.length > 0 ? "pointer" : "not-allowed", background: combo.length > 0 ? "#E84C1E" : "#111", border: "0.5px solid #E84C1E", borderRadius: 6, color: "#fff", fontFamily: "monospace", opacity: combo.length === 0 ? 0.4 : 1 }}>
            {t("kb.confirm", "Confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
