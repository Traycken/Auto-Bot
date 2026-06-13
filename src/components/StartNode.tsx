import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

import { useNodeWidth } from "../store/editorStore";

export const StartNode = memo(function StartNode() {
  const NODE_W = useNodeWidth();
  return (
    <div style={{
      width: NODE_W,
      background: "#0d1f14",
      border: "1.5px solid #22C55E",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 0",
      fontFamily: "monospace",
      fontSize: 12,
      color: "#22C55E",
      boxShadow: "0 0 16px #22C55E22",
      position: "relative",
      userSelect: "none",
    }}>
      <i className="ti ti-player-play" style={{ fontSize: 14 }} />
      <span style={{ fontWeight: 600, letterSpacing: "0.06em" }}>DÉPART</span>
      {/* Lock icon — visual hint that this node cannot be deleted */}
      {/* Lock and Help icons */}
      <div style={{
        position: "absolute", top: 4, right: 6,
        display: "flex", gap: 4, alignItems: "center"
      }}>
        <span title="Nœud unique — non supprimable" style={{
          fontSize: 8, color: "#22C55E55",
        }}>
          <i className="ti ti-lock" />
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "start" } }));
          }}
          title="Aide sur ce bloc"
          style={{
            width:12, height:12, borderRadius:3, background:"transparent",
            border:"none", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", padding:0,
            color:"#22C55E88", fontSize:8, lineHeight:1, fontFamily:"monospace",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#22C55E")}
          onMouseLeave={e => (e.currentTarget.style.color = "#22C55E88")}
        >?</button>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ left: "50%", background: "#22C55E", border: "1.5px solid #0d1f14", width: 10, height: 10 }}
      />
    </div>
  );
});
