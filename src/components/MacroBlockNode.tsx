import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CmdHistoryModal } from "./CmdHistoryModal";

interface BlockNodeData {
  label: string; color: string; icon: string; kind: string;
  [key: string]: unknown;
}

// All blocks snap to 180px width (9 × 20px grid)
const NODE_W = 180;

const BLACKLIST = new Set([
  "label","color","icon","kind","children",
  "expected_hex","expected_r","expected_g","expected_b",
  "expected_h","expected_s","expected_v","template_b64",
  "output_true","output_false",
  "match_text","match_case","match_whole_word","use_regex",
  "command","match_mode",
]);

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "string" && v.length === 0) return "—";
  if (typeof v === "string" && v.startsWith("#") && v.length === 7) return v;
  if (typeof v === "string" && v.length > 14) return v.slice(0, 12) + "…";
  return String(v);
}

const KEY_MAP: Record<string, string> = {
  x:"X", y:"Y", screen:"écran", duration_ms:"ms", delay_after_ms:"délai ms",
  button:"btn", double_click:"×2", relative:"rel", key_combo:"touche",
  hold_ms:"maintien", text:"texte", delay_between_chars_ms:"ms/car",
  times:"fois", interval_ms:"int ms", expected_color:"couleur",
  tolerance:"tol", output_var:"→", threshold:"seuil", lang:"lang",
  operator:"op", inputs:"entrées", name:"nom", value:"val",
  delta_x:"ΔX", delta_y:"ΔY", width:"w", height:"h",
  color_format:"fmt", var_name:"var", from:"de", to:"à", step:"pas",
  region_x:"rx", region_y:"ry", region_w:"rw", region_h:"rh",
  target_var:"→var", expression:"expr",
};

// Nodes with two bottom output handles (found / not_found)
const DUAL_HANDLE_KINDS = new Set(["image_match", "pixel_color", "ocr"]);

export const MacroBlockNode = memo(function MacroBlockNode({ id, data, selected }: NodeProps) {
  const d = data as BlockNodeData;
  const [cmdHistoryOpen, setCmdHistoryOpen] = useState(false);
  const fields = Object.entries(d)
    .filter(([k]) => !BLACKLIST.has(k))
    .slice(0, 3);

  const hasDualHandles = DUAL_HANDLE_KINDS.has(d.kind);

  const openHelp = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: d.kind } }));
  };

  const openCmdHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCmdHistoryOpen(true);
  };

  return (
    <div style={{
      width: NODE_W,
      background: "#18181b",
      border: `1px solid ${selected ? d.color : "#2a2a2e"}`,
      borderRadius: 8,
      boxShadow: selected ? `0 0 0 2px ${d.color}33` : "0 2px 8px #0006",
      fontFamily: "monospace",
      position: "relative",
    }}>
      {/* Top handle — centered */}
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:"#333", border:"1.5px solid #555", width:10, height:10 }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#111113", borderBottom:"0.5px solid #2a2a2e", borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:d.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className={`ti ${d.icon}`} style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:500, color:"#e0e0e0", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{d.label}</span>
        {d.kind === "cmd" && (
          <button
            onClick={openCmdHistory}
            title="Historique console"
            style={{
              width:16, height:16, borderRadius:4, background:"transparent",
              border:"0.5px solid #333", cursor:"pointer", display:"flex",
              alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
              color:"#64748B", fontSize:9, lineHeight:1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#94A3B8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
          >
            <i className="ti ti-terminal-2" style={{ fontSize:9 }} />
          </button>
        )}
        <button
          onClick={openHelp}
          title="Aide sur ce bloc"
          style={{
            width:16, height:16, borderRadius:4, background:"transparent",
            border:"0.5px solid #333", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
            color:"#555", fontSize:9, lineHeight:1, fontFamily:"monospace",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#555")}
        >?</button>
      </div>

      {/* Fields preview */}
      {fields.length > 0 && (
        <div style={{ padding:"6px 10px 8px" }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
              <span style={{ color:"#444", fontSize:9 }}>{KEY_MAP[k] ?? k.replace(/_/g," ")}</span>
              <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                {typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) && (
                  <span style={{ width:8, height:8, borderRadius:2, background:v, border:"0.5px solid #444", display:"inline-block" }} />
                )}
                <span style={{ color:"#999", fontSize:10, fontWeight:500, background:"#111", padding:"1px 5px", borderRadius:3, border:"0.5px solid #222", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {fmtVal(v)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom handle(s) */}
      {hasDualHandles ? (
        <>
          <div style={{ display:"flex", borderTop:"0.5px solid #1a1a1e", padding:"4px 10px 14px" }}>
            <span style={{ flex:1, textAlign:"center", fontSize:8, color:"#1D9E75" }}>Trouvé</span>
            <span style={{ flex:1, textAlign:"center", fontSize:8, color:"#E24B4A" }}>Non trouvé</span>
          </div>
          <Handle type="source" id="found" position={Position.Bottom}
            style={{ left:"30%", background:"#1D9E75", border:"1.5px solid #111", width:10, height:10 }} />
          <Handle type="source" id="not_found" position={Position.Bottom}
            style={{ left:"70%", background:"#E24B4A", border:"1.5px solid #111", width:10, height:10 }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom}
          style={{ left:"50%", background:"#333", border:"1.5px solid #555", width:10, height:10 }} />
      )}
      {cmdHistoryOpen && <CmdHistoryModal nodeId={id} onClose={() => setCmdHistoryOpen(false)} />}
    </div>
  );
});
