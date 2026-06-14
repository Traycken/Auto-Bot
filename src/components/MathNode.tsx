import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useNodeWidth, t } from "../store/editorStore";

interface MathData { target_var: string; expression: string; [key: string]: unknown; }

export const MathNode = memo(function MathNode({ data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as MathData;
  const C = "#7F77DD";

  const renderExpr = (expr: string) =>
    expr.split(/(%{1,2}\w*)/g).map((p, i) =>
      p.startsWith("%%") ? <span key={i} style={{ color:"#888" }}>%</span>
      : p.startsWith("%") ? <span key={i} style={{ color:"#c792ea", fontWeight:600 }}>{p}</span>
      : <span key={i} style={{ color:"#EF9F27" }}>{p}</span>
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
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:"#444", border:"1.5px solid #666", width:10, height:10 }} />

      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#111113", borderBottom:"0.5px solid #2a2a2e", borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:C, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-calculator" style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:500, color:"#e0e0e0", fontSize:11, flex:1 }}>
          {t("node.math", "Math")}{d.alias ? ` (${d.alias})` : ""}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "math" } }));
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

      <div style={{ padding:"7px 10px 9px", fontSize:10 }}>
        <span style={{ color:"#c792ea", fontWeight:600 }}>%{d.target_var||"result"}</span>
        <span style={{ color:"#555" }}> = </span>
        {d.expression
          ? renderExpr(d.expression)
          : <span style={{ color:"#444", fontStyle:"italic" }}>…</span>
        }
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ left:"50%", background:"#444", border:"1.5px solid #666", width:10, height:10 }} />
    </div>
  );
});
