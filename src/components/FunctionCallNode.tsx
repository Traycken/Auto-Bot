import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useNodeWidth } from "../store/editorStore";

interface FunctionCallData {
  function_name: string;
  call_args: { name: string; value: string }[];
  return_var: string;
  [key: string]: unknown;
}

const C = "#A855F7";

export const FunctionCallNode = memo(function FunctionCallNode({ data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as FunctionCallData;
  const args = d.call_args ?? [];
  const retVar = d.return_var || (d.function_name ? `${d.function_name}_Return` : "Return");

  return (
    <div style={{
      width: NODE_W,
      background: "#160d22",
      border: `1px solid ${selected ? C : "#3a2a4e"}`,
      borderRadius: 8,
      boxShadow: selected ? `0 0 0 2px ${C}33` : "0 2px 8px #0006",
      fontFamily: "monospace",
      position: "relative",
    }}>
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:"#3a2a4e", border:`1.5px solid ${C}55`, width:10, height:10 }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#0e0818", borderBottom:"0.5px solid #2a1a3e", borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:C, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-function" style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:500, color:"#e0e0e0", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          {d.function_name ? `${d.function_name}${d.alias ? ` (${d.alias})` : ""}` : <span style={{ color:"#3a2a4e", fontStyle:"italic" }}>choisir…</span>}
        </span>
        <span style={{ fontSize:9, color:C, background:`${C}22`, padding:"1px 5px", borderRadius:4, flexShrink:0, marginRight:4 }}>fn</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "function_call" } }));
          }}
          title="Aide sur ce bloc"
          style={{
            width:16, height:16, borderRadius:4, background:"transparent",
            border:"0.5px solid #3a2a4e", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
            color:"#666", fontSize:9, lineHeight:1, fontFamily:"monospace",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#666")}
        >?</button>
      </div>

      {/* Args summary */}
      <div style={{ padding:"6px 10px 4px" }}>
        {args.length === 0
          ? <span style={{ fontSize:9, color:"#2a1a3e" }}>aucun argument</span>
          : args.slice(0, 3).map((a, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
                <span style={{ fontSize:9, color:`${C}88`, minWidth:50, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}:</span>
                <span style={{ fontSize:9, color:"#c792ea", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:80 }}>{a.value || "—"}</span>
              </div>
            ))
        }
        {args.length > 3 && <span style={{ fontSize:9, color:"#3a2a4e" }}>+{args.length - 3} autres…</span>}
      </div>

      {/* Return var */}
      <div style={{ padding:"0 10px 10px", borderTop:"0.5px solid #1a0a2e", marginTop:4, paddingTop:5 }}>
        <span style={{ fontSize:9, color:"#444" }}>→ </span>
        <span style={{ fontSize:9, color:"#c792ea" }}>%{retVar}</span>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ left:"50%", background:"#3a2a4e", border:`1.5px solid ${C}55`, width:10, height:10 }} />
    </div>
  );
});
