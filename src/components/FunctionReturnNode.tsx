import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface FunctionReturnData { value: string; [key: string]: unknown; }

const NODE_W = 200;
const C = "#EF9F27";

function renderExpr(expr: string) {
  return expr.split(/(%{1,2}\w*)/g).map((p, i) =>
    p.startsWith("%%") ? <span key={i} style={{ color:"#888" }}>%</span>
    : p.startsWith("%") ? <span key={i} style={{ color:"#c792ea", fontWeight:600 }}>{p}</span>
    : <span key={i} style={{ color:"#EF9F27" }}>{p}</span>
  );
}

export const FunctionReturnNode = memo(function FunctionReturnNode({ data, selected }: NodeProps) {
  const d = data as FunctionReturnData;

  return (
    <div style={{
      width: NODE_W,
      background: "#1f1708",
      border: `1.5px solid ${selected ? C : C + "88"}`,
      borderRadius: 8,
      boxShadow: selected ? `0 0 0 2px ${C}33` : `0 0 16px ${C}18`,
      fontFamily: "monospace",
      position: "relative",
    }}>
      {/* Single input handle */}
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:C, border:`1.5px solid #1f1708`, width:10, height:10 }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#140f02", borderBottom:`0.5px solid ${C}33`, borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:C, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-corner-up-left" style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:600, color:C, fontSize:11, letterSpacing:"0.06em" }}>RETOUR</span>
        <span style={{ marginLeft:"auto", fontSize:9, color:`${C}99`, background:`${C}18`, padding:"1px 6px", borderRadius:4 }}>sortie</span>
      </div>

      {/* Value preview */}
      <div style={{ padding:"7px 10px 10px", fontSize:10, minHeight:28 }}>
        {d.value
          ? <><span style={{ color:"#555", fontSize:9 }}>return </span>{renderExpr(d.value)}</>
          : <span style={{ color:"#4a3a10", fontStyle:"italic" }}>valeur non définie</span>
        }
      </div>
    </div>
  );
});
