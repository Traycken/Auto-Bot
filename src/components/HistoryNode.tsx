import { memo, useState, useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";
import { Handle, Position } from "@xyflow/react";

interface HistoryNodeData {
  targetNodeId: string;
  targetNodeLabel?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export const HistoryNode = memo(function HistoryNode({ id, data }: { id: string; data: any }) {
  const d = data as HistoryNodeData;
  const targetId = d.targetNodeId;
  const history = useEditorStore(s => s.cmdHistory[targetId] ?? []);
  const clearCmdHistory = useEditorStore(s => s.clearCmdHistory);
  const updateNodeData = useEditorStore(s => s.updateNodeData);
  
  const [width, setWidth] = useState(d.width ?? 320);
  const [height, setHeight] = useState(d.height ?? 240);
  const [dragging, setDragging] = useState(false);
  const resizeStart = useRef({ w: 0, h: 0, x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = { w: width, h: height, x: e.clientX, y: e.clientY };
    setDragging(true);
  }, [width, height]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dw = e.clientX - resizeStart.current.x;
      const dh = e.clientY - resizeStart.current.y;
      const nw = Math.max(200, resizeStart.current.w + dw);
      const nh = Math.max(150, resizeStart.current.h + dh);
      setWidth(nw);
      setHeight(nh);
    };
    const onUp = () => {
      setDragging(false);
      updateNodeData(id, { width, height });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, width, height, id, updateNodeData]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (targetId) {
      clearCmdHistory(targetId);
    }
  }, [targetId, clearCmdHistory]);

  return (
    <div style={{
      width,
      height,
      background: "#0e0e10",
      border: "1px solid #64748B",
      borderRadius: 8,
      boxShadow: "0 4px 12px #000a",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      fontFamily: "monospace",
    }}>
      {/* Handle for virtual edge rendering point */}
      <Handle type="target" position={Position.Top} id="virt_target" style={{ opacity: 0, top: 0 }} />

      {/* Drag handle area for React Flow */}
      <div className="custom-drag-handle" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        background: "#18181b",
        borderBottom: "0.5px solid #2a2a2e",
        cursor: "move",
        borderRadius: "8px 8px 0 0",
        userSelect: "none",
      }}>
        <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 5 }}>
          <i className="ti ti-terminal-2" />
          {(() => {
            const store = useEditorStore.getState();
            const activeTab = store.tabs.find(t => t.id === store.activeTabId);
            const targetNode = activeTab?.nodes.find(n => n.id === targetId);
            const alias = targetNode?.data?.alias as string | undefined;
            if (alias && alias.trim() !== "") {
              return `${targetNode?.data?.label || "Historique"} (${alias})`;
            }
            return `${d.targetNodeLabel || "Historique"} (${targetId || "non lié"})`;
          })()}
        </span>
        {targetId && (
          <button
            onClick={handleClear}
            title="Vider l'historique"
            style={{
              background: "none",
              border: "none",
              color: "#E24B4A",
              cursor: "pointer",
              padding: "2px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <i className="ti ti-trash" />
          </button>
        )}
      </div>

      {/* History content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {history.length === 0 ? (
          <div style={{ color: "#444", fontSize: 10, textAlign: "center", marginTop: 40 }}>
            Aucun historique
          </div>
        ) : (
          [...history].reverse().map((entry, idx) => {
            const isFailed = entry.exit_code !== null && entry.exit_code !== 0;
            return (
              <div key={idx} style={{ marginBottom: 8, padding: 6, background: "#111113", border: "0.5px solid #2a2a2e", borderRadius: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#555", marginBottom: 3 }}>
                  <span>{entry.timestamp}</span>
                  <span style={{ color: entry.async ? "#378ADD" : isFailed ? "#E24B4A" : "#1D9E75" }}>
                    {entry.async ? "async" : `exit ${entry.exit_code}`}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "#777", wordBreak: "break-all", marginBottom: 4 }}>
                  $ {entry.command}
                </div>
                {entry.stdout && <pre style={{ fontSize: 9, color: "#ccc", margin: 0, whiteSpace: "pre-wrap" }}>{entry.stdout}</pre>}
                {entry.stderr && <pre style={{ fontSize: 9, color: isFailed ? "#E24B4A" : "#888", margin: "3px 0 0", whiteSpace: "pre-wrap" }}>{entry.stderr}</pre>}
              </div>
            );
          })
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: "absolute",
          right: 0, bottom: 0,
          width: 12, height: 12,
          cursor: "se-resize",
          background: "linear-gradient(135deg, transparent 50%, #64748B 50%)",
          borderRadius: "0 0 8px 0",
        }}
      />
    </div>
  );
});

