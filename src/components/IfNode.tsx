import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useNodeWidth, t } from "../store/editorStore";

interface IfData { condition: string; [key: string]: unknown; }

export const IfNode = memo(function IfNode({ data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as IfData;
  const C = "#EF9F27";

  const renderCond = (cond: string) =>
    cond.split(/(%{1,2}\w*)/g).map((p, i) =>
      p.startsWith("%%") ? <span key={i} style={{ color:"#888" }}>%</span>
      : p.startsWith("%") ? <span key={i} style={{ color:"#c792ea", fontWeight:600 }}>{p}</span>
      : <span key={i} style={{ color:"#d0d0d0" }}>{p}</span>
    );

  return (
    <div style={{
      width: NODE_W,
      background: "#18181b",
      border: `1px solid ${selected ? C : "#2a2a2e"}`,
      borderRadius: 8,
      boxShadow: selected ? `0 0 0 2px ${C}33` : "0 2px 8px #0006",
      fontFamily: "monospace",
      position: "relative",
    }}>
      {/* Top entry */}
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:"#444", border:"1.5px solid #666", width:10, height:10 }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#111113", borderBottom:"0.5px solid #2a2a2e", borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:C, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-git-branch" style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:500, color:"#e0e0e0", fontSize:11, flex:1 }}>
          {t("node.if", "Si (If)")}{d.alias ? ` (${d.alias})` : ""}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "if" } }));
          }}
          title={t("node.help_tooltip", "Aide sur ce bloc")}
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

      {/* Condition preview */}
      <div style={{ padding:"7px 10px 36px", fontSize:10, lineHeight:1.5, wordBreak:"break-all", minHeight:20 }}>
        <span style={{ fontSize:9, color:"#444", display:"block", marginBottom:2, textTransform:"uppercase", letterSpacing:"0.06em" }}>{t("node.if.condition", "condition")}</span>
        {d.condition
          ? renderCond(d.condition)
          : <span style={{ color:"#333", fontStyle:"italic" }}>{t("node.if.empty", "vide")}</span>
        }
      </div>

      {/* Labels */}
      <div style={{ position:"absolute", bottom:12, left:0, width:"100%", display:"flex", pointerEvents:"none" }}>
        <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
          <span style={{ fontSize:8, color:"#1D9E75" }}>{t("node.if.true", "✓ vrai")}</span>
        </div>
        <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
          <span style={{ fontSize:8, color:"#E24B4A" }}>{t("node.if.false", "✗ faux")}</span>
        </div>
      </div>

      {/* vrai — left quarter */}
      <Handle type="source" id="true" position={Position.Bottom}
        style={{ left:"25%", background:"#1D9E75", border:"1.5px solid #0d1f14", width:10, height:10 }} />

      {/* faux — right quarter */}
      <Handle type="source" id="false" position={Position.Bottom}
        style={{ left:"75%", background:"#E24B4A", border:"1.5px solid #111", width:10, height:10 }} />
    </div>
  );
});
