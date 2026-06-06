import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface ForData { var_name: string; from: string; to: string; step: string; [key: string]: unknown; }

// Width = 200px (10 × 20px snap grid)
// Total height is fixed so handles sit exactly on the bottom border
const NODE_W = 200;
const C = "#7F77DD";

const HANDLES = [
  { id: "body",  label: "▶ corps",  color: "#1D9E75", type: "source" as const, pct: "12.5%" },
  { id: "loop",  label: "↩ retour", color: "#7F77DD", type: "target" as const, pct: "37.5%" },
  { id: "break", label: "⏏ break",  color: "#E24B4A", type: "target" as const, pct: "62.5%" },
  { id: "after", label: "→ suite",  color: "#999",    type: "source" as const, pct: "87.5%" },
];

export const ForNode = memo(function ForNode({ data, selected }: NodeProps) {
  const d = data as ForData;

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
      {/* Entry handle — top center */}
      <Handle type="target" id="in" position={Position.Top}
        style={{ left: "50%", background: "#444", border: "1.5px solid #666", width: 10, height: 10 }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "#111113", borderBottom: "0.5px solid #2a2a2e", borderRadius: "8px 8px 0 0" }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: C, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-arrows-right-left" style={{ fontSize: 11, color: "#fff" }} />
        </div>
        <span style={{ fontWeight: 500, color: "#e0e0e0", fontSize: 11 }}>Boucle FOR</span>
      </div>

      {/* Expression */}
      <div style={{ padding: "8px 10px", fontSize: 10, lineHeight: 1.7 }}>
        <span style={{ color: C }}>pour </span>
        <span style={{ color: "#e0e0e0", fontWeight: 600 }}>{d.var_name || "i"}</span>
        <span style={{ color: C }}> de </span>
        <span style={{ color: "#EF9F27" }}>{d.from || "0"}</span>
        <span style={{ color: C }}> à </span>
        <span style={{ color: "#EF9F27" }}>{d.to || "10"}</span>
        <span style={{ color: C }}> pas </span>
        <span style={{ color: "#EF9F27" }}>{d.step || "1"}</span>
      </div>

      {/* Handle labels — fixed height row */}
      <div style={{ display: "flex", borderTop: "0.5px solid #1a1a1e", paddingTop: 4, paddingBottom: 14 }}>
        {HANDLES.map(({ id, label, color }) => (
          <div key={id} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <span style={{ fontSize: 8, color, letterSpacing: "0.01em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Handles pinned to bottom at fixed percentages */}
      {HANDLES.map(({ id, label: _l, color, type, pct }) => (
        <Handle
          key={id}
          type={type}
          id={id}
          position={Position.Bottom}
          style={{ left: pct, background: color, border: "1.5px solid #111", width: 10, height: 10 }}
        />
      ))}
    </div>
  );
});
