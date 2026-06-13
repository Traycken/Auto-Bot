import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useNodeWidth } from "../store/editorStore";

interface ArgDef { name: string; type: string; }
interface FunctionArgsData { args: (string | ArgDef)[]; [key: string]: unknown; }

const C = "#22C55E";

export const FunctionArgsNode = memo(function FunctionArgsNode({ data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as FunctionArgsData;
  const args = d.args ?? [];

  return (
    <div style={{
      width: NODE_W,
      background: "#0d1f14",
      border: `1.5px solid ${selected ? C : C + "88"}`,
      borderRadius: 8,
      boxShadow: selected ? `0 0 0 2px ${C}33` : `0 0 16px ${C}18`,
      fontFamily: "monospace",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#081410", borderBottom:`0.5px solid ${C}33`, borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:C, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-input-check" style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:600, color:C, fontSize:11, letterSpacing:"0.06em" }}>ARGUMENTS</span>
        <span style={{ marginLeft:"auto", fontSize:9, color:`${C}99`, background:`${C}18`, padding:"1px 6px", borderRadius:4, marginRight:4 }}>entrée</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "function_args" } }));
          }}
          title="Aide sur ce bloc"
          style={{
            width:16, height:16, borderRadius:4, background:"transparent",
            border:"0.5px solid #2a4a30", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
            color:"#555", fontSize:9, lineHeight:1, fontFamily:"monospace",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#555")}
        >?</button>
      </div>

      {/* Args list */}
      <div style={{ padding:"7px 10px 10px", minHeight:28 }}>
        {args.length === 0
          ? <span style={{ fontSize:10, color:"#2a4a30", fontStyle:"italic" }}>aucun argument</span>
          : args.map((a, i) => {
              const argName = typeof a === 'string' ? a : a.name;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                  <span style={{ fontSize:9, color:`${C}66`, minWidth:14 }}>{i+1}.</span>
                  <span style={{ fontSize:10, color:"#c792ea", fontWeight:600 }}>%{argName}</span>
                </div>
              );
            })
        }
      </div>

      {/* Single output handle */}
      <Handle type="source" position={Position.Bottom}
        style={{ left:"50%", background:C, border:`1.5px solid #0d1f14`, width:10, height:10 }} />
    </div>
  );
});
