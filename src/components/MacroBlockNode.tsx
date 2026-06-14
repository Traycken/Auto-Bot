import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CmdHistoryModal } from "./CmdHistoryModal";
import { useNodeWidth, useEditorStore, t } from "../store/editorStore";


const BLACKLIST = new Set([
  "label","color","icon","kind","children",
  "expected_hex","expected_r","expected_g","expected_b",
  "expected_h","expected_s","expected_v","template_b64",
  "output_true","output_false",
  "match_text","match_case","match_whole_word","use_regex",
  "command","match_mode",
]);

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "string" && v.length === 0) return "—";
  if (typeof v === "string" && v.startsWith("#") && v.length === 7) return v;
  if (typeof v === "string" && v.length > 14) return v.slice(0, 12) + "…";
  return String(v);
}

// Nodes with two bottom output handles (found / not_found)
const DUAL_HANDLE_KINDS = new Set(["image_match", "pixel_color", "ocr"]);

const LOOP_KINDS = new Set(["iterations", "foreach"]);

export const MacroBlockNode = memo(function MacroBlockNode({ id, data, selected }: NodeProps) {
  const NODE_W = useNodeWidth();
  const d = data as any;
  const [cmdHistoryOpen, setCmdHistoryOpen] = useState(false);
  const fields = Object.entries(d)
    .filter(([k]) => !BLACKLIST.has(k))
    .slice(0, 3);

  const hasDualHandles = (DUAL_HANDLE_KINDS.has(d.kind) && !d.infinite) ||
    (d.kind === "vpo" && d.mode === "detect" && typeof d.class_name === "string" && d.class_name.trim() !== "");

  const isInfiniteSingleHandle = DUAL_HANDLE_KINDS.has(d.kind) && !!d.infinite;

  const active = useEditorStore(s => s.activeNodeId === id);
  const waitProgress = useEditorStore(s => s.waitProgress[id]);
  const currentTick = useEditorStore(s => s.forTicks[id]);

  const openHelp = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("open-help", { detail: { kind: d.kind } }));
  };

  const openCmdHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useEditorStore.getState();
    const activeTab = store.tabs.find(t => t.id === store.activeTabId);
    if (!activeTab) return;

    // Look for an existing historyNode targeting this node
    const existing = activeTab.nodes.find(n => (n.data?.kind as string) === "history" && n.data?.targetNodeId === id);
    if (existing) {
      store.selectNode(existing.id);
      return;
    }

    // Otherwise, spawn a new historyNode placed 150px to the right
    const currentNodes = activeTab.nodes;
    const thisNode = currentNodes.find(n => n.id === id);
    const pos = thisNode ? { x: thisNode.position.x + 240, y: thisNode.position.y } : { x: 100, y: 100 };

    store.addNode("history" as any, pos);
    // Find the newly added node (it will be the last element or selectedNodeId)
    setTimeout(() => {
      const updatedStore = useEditorStore.getState();
      const updatedTab = updatedStore.tabs.find(t => t.id === updatedStore.activeTabId);
      if (updatedTab) {
        // The newly added node is selected
        const newId = updatedStore.selectedNodeId;
        if (newId) {
          updatedStore.updateNodeData(newId, {
            targetNodeId: id,
            targetNodeLabel: d.label,
          });
        }
      }
    }, 50);
  };

  const localizedKey = (k: string) => {
    const keys: Record<string, string> = {
      x: t("key.x", "X"), y: t("key.y", "Y"), screen: t("key.screen", "écran"), duration_ms: t("key.duration_ms", "ms"), delay_after_ms: t("key.delay_after_ms", "délai ms"),
      button: t("key.button", "btn"), double_click: t("key.double_click", "×2"), relative: t("key.relative", "rel"), key_combo: t("key.key_combo", "touche"),
      hold_ms: t("key.hold_ms", "maintien"), text: t("key.text", "texte"), delay_between_chars_ms: t("key.delay_between_chars_ms", "ms/car"),
      times: t("key.times", "fois"), interval_ms: t("key.interval_ms", "int ms"), expected_color: t("key.expected_color", "couleur"),
      tolerance: t("key.tolerance", "tol"), output_var: t("key.output_var", "→"), threshold: t("key.threshold", "seuil"), lang: t("key.lang", "lang"),
      operator: t("key.operator", "op"), inputs: t("key.inputs", "entrées"), name: t("key.name", "nom"), value: t("key.value", "val"),
      delta_x: t("key.delta_x", "ΔX"), delta_y: t("key.delta_y", "ΔY"), width: t("key.width", "w"), height: t("key.height", "h"),
      color_format: t("key.color_format", "fmt"), var_name: t("key.var_name", "var"), from: t("key.from", "de"), to: t("key.to", "à"), step: t("key.step", "pas"),
      region_x: t("key.region_x", "rx"), region_y: t("key.region_y", "ry"), region_w: t("key.region_w", "rw"), region_h: t("key.region_h", "rh"),
      target_var: t("key.target_var", "→var"), expression: t("key.expression", "expr"),
    };
    return keys[k] ?? k.replace(/_/g," ");
  };

  const LOOP_HANDLES = [
    { id: "body",  label: t("node.for.body", "▶ corps"),  color: "#1D9E75", type: "source" as const, pct: "12.5%" },
    { id: "loop",  label: t("node.for.return", "↩ retour"), color: "#7F77DD", type: "target" as const, pct: "37.5%" },
    { id: "break", label: t("node.for.break", "⏏ break"),  color: "#E24B4A", type: "target" as const, pct: "62.5%" },
    { id: "after", label: t("node.for.suite", "→ suite"),  color: "#999",    type: "source" as const, pct: "87.5%" },
  ];

  return (
    <div style={{
      width: NODE_W,
      background: "#18181b",
      border: `1px solid ${active ? d.color : selected ? "#e0e0e0" : "#2a2a2e"}`,
      borderRadius: 8,
      boxShadow: active ? `0 0 12px ${d.color}55` : selected ? `0 0 0 2px ${d.color}33` : "0 2px 8px #0006",
      fontFamily: "monospace",
      position: "relative",
    }}>
      {/* Top handle — centered */}
      <Handle type="target" position={Position.Top}
        style={{ left:"50%", background:"#333", border:"1.5px solid #555", width:10, height:10 }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#111113", borderBottom:"0.5px solid #2a2a2e", borderRadius:"8px 8px 0 0" }}>
        <div style={{ width:20, height:20, borderRadius:5, background:d.color as string, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className={`ti ${d.icon as string}`} style={{ fontSize:11, color:"#fff" }} />
        </div>
        <span style={{ fontWeight:500, color:"#e0e0e0", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          {t("node." + d.kind, d.label as string)}{d.alias ? ` (${d.alias as string})` : ""}
        </span>
        {currentTick !== undefined && (
          <span style={{ fontSize: 9, padding: "1px 5px", background: `${d.color as string}22`, border: `0.5px solid ${d.color as string}`, borderRadius: 4, color: "#fff", marginRight: 4 }}>
            {d.kind === "iterations" ? `${t("node.iterations.loop_index", "tour")} ${currentTick as string}` : `${t("node.foreach.loop_index", "index")} ${currentTick as string}`}
          </span>
        )}
        {d.kind !== "console" && (d.kind as string) !== "history" && (
          <button
            onClick={openCmdHistory}
            title={t("cmd.history_title", "Historique console")}
            style={{
              width:16, height:16, borderRadius:4, background:"transparent",
              border:"0.5px solid #333", cursor:"pointer", display:"flex",
              alignItems:"center", justifyContent:"center", padding:0, flexShrink:0,
              color:"#64748B", fontSize:9, lineHeight:1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#94A3B8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#64748B")}
          >
            <i className="ti ti-terminal-2" style={{ fontSize:9 }} />
          </button>
        )}
        <button
          onClick={openHelp}
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

      {/* Fields preview */}
      {fields.length > 0 && (
        <div style={{ padding:"6px 10px 8px" }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
              <span style={{ color:"#444", fontSize:9 }}>{localizedKey(k)}</span>
              <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                {typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) && (
                  <span style={{ width:8, height:8, borderRadius:2, background:v, border:"0.5px solid #444", display:"inline-block" }} />
                )}
                <span style={{ color:"#999", fontSize:10, fontWeight:500, background:"#111", padding:"1px 5px", borderRadius:3, border:"0.5px solid #222", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {fmtVal(v)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Visual capture preview in the node */}
      {d.last_capture && (
        <div style={{ padding: "4px", background: "#0d0d0f", borderRadius: 4, overflow: "hidden", margin: "0 10px 8px", border: "0.5px solid #2a2a2e" }}>
          <img
            src={`data:image/png;base64,${d.last_capture as string}`}
            style={{ maxWidth: "100%", maxHeight: 60, display: "block", objectFit: "contain", margin: "0 auto", borderRadius: 3 }}
          />
        </div>
      )}

      {/* Wait progress bar */}
      {d.kind === "wait" && waitProgress !== undefined && (
        <div style={{ height: 3, width: "100%", background: "#222" }}>
          <div style={{ height: "100%", width: `${waitProgress}%`, background: d.color, transition: "width 0.05s linear" }} />
        </div>
      )}

      {/* Bottom handle(s) */}
      {hasDualHandles ? (
        <>
          <div style={{ display:"flex", borderTop:"0.5px solid #1a1a1e", padding:"4px 10px 14px" }}>
            <span style={{ flex:1, textAlign:"center", fontSize:8, color:"#1D9E75" }}>{t("node.found", "Trouvé")}</span>
            <span style={{ flex:1, textAlign:"center", fontSize:8, color:"#E24B4A" }}>{t("node.not_found", "Non trouvé")}</span>
          </div>
          <Handle type="source" id="found" position={Position.Bottom}
            style={{ left:"30%", background:"#1D9E75", border:"1.5px solid #111", width:10, height:10 }} />
          <Handle type="source" id="not_found" position={Position.Bottom}
            style={{ left:"70%", background:"#E24B4A", border:"1.5px solid #111", width:10, height:10 }} />
        </>
      ) : isInfiniteSingleHandle ? (
        <>
          <div style={{ display:"flex", borderTop:"0.5px solid #1a1a1e", padding:"4px 10px 14px" }}>
            <span style={{ flex:1, textAlign:"center", fontSize:8, color:"#1D9E75" }}>{t("node.found", "Trouvé")}</span>
          </div>
          <Handle type="source" id="found" position={Position.Bottom}
            style={{ left:"50%", background:"#1D9E75", border:"1.5px solid #111", width:10, height:10 }} />
        </>
      ) : LOOP_KINDS.has(d.kind) ? (
        <>
          <div style={{ display: "flex", borderTop: "0.5px solid #1a1a1e", paddingTop: 4, paddingBottom: 14 }}>
            {LOOP_HANDLES.map(({ id, label, color }) => (
              <div key={id} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <span style={{ fontSize: 8, color, letterSpacing: "0.01em" }}>{label}</span>
              </div>
            ))}
          </div>
          {LOOP_HANDLES.map(({ id, label: _l, color, type, pct }) => (
            <Handle
              key={id}
              type={type}
              id={id}
              position={Position.Bottom}
              style={{ left: pct, background: color, border: "1.5px solid #111", width: 10, height: 10 }}
            />
          ))}
        </>
      ) : (
        <Handle type="source" position={Position.Bottom}
          style={{ left:"50%", background:"#333", border:"1.5px solid #555", width:10, height:10 }} />
      )}
      {cmdHistoryOpen && <CmdHistoryModal nodeId={id} onClose={() => setCmdHistoryOpen(false)} />}
    </div>
  );
});
