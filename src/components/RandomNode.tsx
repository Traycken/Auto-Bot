import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useNodeWidth, t } from "../store/editorStore";

interface RandomData { mode: string; min: string; max: string; output_var: string; use_seed: boolean; seed: string; list_items: string; [key: string]: unknown; }

const C = "#D4537E";

export const RandomNode = memo(function RandomNode({ data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as RandomData;
  return (
    <div style={{ width: NODE_W, background: "#18181b", border: `1px solid ${selected ? C : "#2a2a2e"}`, borderRadius: 8, boxShadow: selected ? `0 0 0 2px ${C}33` : "0 2px 8px #0006", fontFamily: "monospace", position: "relative" }}>
      <Handle type="target" position={Position.Top} style={{ left: "50%", background: "#444", border: "1.5px solid #666", width: 10, height: 10 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "#111113", borderBottom: "0.5px solid #2a2a2e", borderRadius: "8px 8px 0 0" }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, background: C, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-dice" style={{ fontSize: 11, color: "#fff" }} />
        </div>
        <span style={{ fontWeight: 500, color: "#e0e0e0", fontSize: 11 }}>
          {t("node.random", "Aléatoire")}{d.alias ? ` (${d.alias})` : ""}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: C, background: `${C}22`, padding: "1px 6px", borderRadius: 4, marginRight: 5 }}>{d.mode?.toUpperCase()}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: "random" } }));
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
      <div style={{ padding: "7px 10px 9px", fontSize: 10 }}>
        {d.mode === "list"
          ? <div style={{ color: "#888" }}>{t("node.random.list", "liste:")} <span style={{ color: "#EF9F27" }}>{(d.list_items || "").split(",").length} {t("node.random.elements", "éléments")}</span></div>
          : <div style={{ color: "#888" }}>
              <span style={{ color: "#EF9F27" }}>{d.min}</span>
              <span style={{ color: "#555" }}> → </span>
              <span style={{ color: "#EF9F27" }}>{d.max}</span>
            </div>
        }
        {d.use_seed && <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>seed: {d.seed}</div>}
        <div style={{ marginTop: 3, color: "#666" }}>→ <span style={{ color: "#c792ea" }}>%{d.output_var}</span></div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ left: "50%", background: "#444", border: "1.5px solid #666", width: 10, height: 10 }} />
    </div>
  );
});
