import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useNodeWidth, useEditorStore } from "../store/editorStore";

interface ForData { var_name: string; from: string; to: string; step: string; [key: string]: unknown; }

const C = "#7F77DD";

const HANDLES = [
  { id: "body",  label: "▶ corps",  color: "#1D9E75", type: "source" as const, pct: "12.5%" },
  { id: "loop",  label: "↩ retour", color: "#7F77DD", type: "target" as const, pct: "37.5%" },
  { id: "break", label: "⏏ break",  color: "#E24B4A", type: "target" as const, pct: "62.5%" },
  { id: "after", label: "→ suite",  color: "#999",    type: "source" as const, pct: "87.5%" },
];

export const ForNode = memo(function ForNode({ id, data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as ForData;

  const currentTick = useEditorStore(s => s.forTicks[id]);
  const active = useEditorStore(s => s.activeNodeId === id);

  return (
    <div style={{
      width: NODE_W,
      background: "#18181b",
      border: `1px solid ${active ? C : selected ? "#e0e0e0" : "#2a2a2e"}`,
      borderRadius: 8,
      boxShadow: active ? `0 0 12px ${C}55` : selected ? `0 0 0 2px ${C}33` : "0 2px 8px #0006",
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
        <span style={{ fontWeight: 500, color: "#e0e0e0", fontSize: 11 }}>
          Boucle FOR{d.alias ? ` (${d.alias})` : ""}
        </span>
        {currentTick !== undefined && (
          <span style={{ marginLeft: "auto", fontSize: 9, padding: "1px 5px", background: `${C}22`, border: `0.5px solid ${C}`, borderRadius: 4, color: "#fff" }}>
            {d.var_name || "i"} = {currentTick}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "for_loop" } }));
          }}
          title="Aide sur ce bloc"
          style={{
            width:16, height:16, borderRadius:4, background:"transparent",
            border:"0.5px solid #333", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
            color:"#555", fontSize:9, lineHeight:1, fontFamily:"monospace",
            marginLeft: currentTick !== undefined ? 0 : "auto"
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#555")}
        >?</button>
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
