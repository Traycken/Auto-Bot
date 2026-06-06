import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

const NODE_W = 180;

export const StartNode = memo(function StartNode() {
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
      <span title="Nœud unique — non supprimable" style={{
        position: "absolute", top: 4, right: 6,
        fontSize: 8, color: "#22C55E55",
      }}>
        <i className="ti ti-lock" />
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ left: "50%", background: "#22C55E", border: "1.5px solid #0d1f14", width: 10, height: 10 }}
      />
    </div>
  );
});
