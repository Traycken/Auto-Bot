import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useNodeWidth, useEditorStore } from "../store/editorStore";

interface SwitchData {
  expression: string;
  cases: string[];
  [key: string]: unknown;
}

const C = "#EF9F27";

export const SwitchNode = memo(function SwitchNode({ id, data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as SwitchData;
  const cases = d.cases ?? [];
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
      {/* Entry Handle (Top) */}
      <Handle type="target" position={Position.Top}
        style={{ left: "50%", background: "#444", border: "1.5px solid #666", width: 10, height: 10 }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "#111113", borderBottom: "0.5px solid #2a2a2e", borderRadius: "8px 8px 0 0" }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: C, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-git-commit" style={{ fontSize: 11, color: "#fff" }} />
        </div>
        <span style={{ fontWeight: 500, color: "#e0e0e0", fontSize: 11, flex: 1 }}>
          Switch{d.alias ? ` (${d.alias})` : ""}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "switch" } }));
          }}
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

      {/* Expression Preview */}
      <div style={{ padding: "8px 10px", fontSize: 10, borderBottom: "0.5px solid #2a2a2e" }}>
        <span style={{ color: "#888" }}>Eval: </span>
        <span style={{ color: "#fff" }}>{d.expression || "vide"}</span>
      </div>

      {/* Dynamic Cases */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {cases.map((c, index) => (
          <div key={index} style={{
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            borderBottom: "0.5px solid #1a1a1e",
            position: "relative"
          }}>
            <span style={{ fontSize: 10, color: "#aaa" }}>cas: {c}</span>
            <Handle
              type="source"
              id={c}
              position={Position.Right}
              style={{
                top: "50%",
                transform: "translateY(-50%)",
                background: C,
                border: "1.5px solid #111",
                width: 9,
                height: 9,
                right: -4
              }}
            />
          </div>
        ))}

        {/* Default case */}
        <div style={{
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          position: "relative"
        }}>
          <span style={{ fontSize: 10, color: "#E24B4A", fontWeight: "bold" }}>défaut</span>
          <Handle
            type="source"
            id="DefaultCase"
            position={Position.Right}
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              background: "#E24B4A",
              border: "1.5px solid #111",
              width: 9,
              height: 9,
              right: -4
            }}
          />
        </div>
      </div>
    </div>
  );
});
