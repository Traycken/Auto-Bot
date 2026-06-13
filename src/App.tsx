import { useEffect, useRef, useCallback, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useReactFlow, ReactFlowProvider,
  type NodeTypes, type Node, type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useEditorStore, type MacroNode, type MacroEdge } from "./store/editorStore";
import { BLOCK_CATALOG, type BlockKind } from "./types/blocks";
import { invoke } from "@tauri-apps/api/core";
import { MacroBlockNode }      from "./components/MacroBlockNode";
import { StartNode }           from "./components/StartNode";
import { ForNode }             from "./components/ForNode";
import { IfNode }              from "./components/IfNode";
import { MathNode }            from "./components/MathNode";
import { RandomNode }          from "./components/RandomNode";
import { FunctionArgsNode }    from "./components/FunctionArgsNode";
import { FunctionReturnNode }  from "./components/FunctionReturnNode";
import { FunctionCallNode }    from "./components/FunctionCallNode";
import { HistoryNode }         from "./components/HistoryNode";
import { SwitchNode }          from "./components/SwitchNode";
import { Inspector }           from "./components/Inspector";
import { Console }             from "./components/Console";
import { Toolbar }             from "./components/Toolbar";
import { AnimatedEdge }        from "./components/AnimatedEdge";
import { TabBar }              from "./components/TabBar";
import { MenuBar }             from "./components/MenuBar";
import { HelpModal, useHelpModal } from "./components/HelpModal";
import { SettingsModal } from "./components/SettingsModal";

const nodeTypes: NodeTypes = {
  macroBlock:          MacroBlockNode,
  startNode:           StartNode,
  forNode:             ForNode,
  ifNode:              IfNode,
  mathNode:            MathNode,
  randomNode:          RandomNode,
  functionArgsNode:    FunctionArgsNode,
  functionReturnNode:  FunctionReturnNode,
  functionCallNode:    FunctionCallNode,
  switchNode:          SwitchNode,
  historyNode:         HistoryNode,
};

const edgeTypes: EdgeTypes = {
  smoothstep: AnimatedEdge,
  default:    AnimatedEdge,
};

const CAT_LABELS: Record<string, string> = {
  mouse: "Souris", keyboard: "Clavier",
  flow: "Contrôle", vision: "Vision", logic: "Logique", function: "Fonctions",
  array: "Arrays", dict: "Dicts", system: "Système",
};

interface DragState { kind: BlockKind; label: string; color: string; x: number; y: number; }

// ── Context Menu ──────────────────────────────────────────────────────────────

interface CtxMenu { x: number; y: number; nodeId?: string; }

function ContextMenu({
  menu, onClose, onDelete, onCopy, onPaste,
}: {
  menu: CtxMenu;
  onClose: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  const items: Array<{ label: string; icon: string; action: () => void; color?: string; disabled?: boolean }> = menu.nodeId
    ? [
        { label: "Copier", icon: "ti-copy", action: () => { onCopy(); onClose(); } },
        { label: "Supprimer", icon: "ti-trash", action: () => { onDelete(); onClose(); }, color: "#E24B4A" },
      ]
    : [
        { label: "Coller", icon: "ti-clipboard", action: () => { onPaste(); onClose(); } },
      ];

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed", left: menu.x, top: menu.y, zIndex: 99999,
        background: "#18181b", border: "0.5px solid #2a2a2e",
        borderRadius: 8, boxShadow: "0 10px 40px #000e",
        padding: "4px 0", minWidth: 160, fontFamily: "monospace",
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          disabled={item.disabled}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "7px 14px", background: "transparent", border: "none",
            cursor: item.disabled ? "default" : "pointer",
            color: item.color ?? "#bbb", fontSize: 11, textAlign: "left",
          }}
          onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = "#222228"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <i className={`ti ${item.icon}`} style={{ fontSize: 12, color: item.color ?? "#666" }} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── AppInner ──────────────────────────────────────────────────────────────────

function AppInner() {
  const {
    tabs, activeTabId,
    onNodesChange, onEdgesChange, onConnect,
    addNode, selectNode, initEngineListeners,
    runSequence, stopSequence,
    copyNodes, pasteNodes, saveActiveTab, openAny,
    removeNode,
    edges,
  } = useEditorStore();

  const activeTab = tabs.find(t => t.id === activeTabId);
  const nodes   = activeTab?.nodes ?? [];
  const tabKind = activeTab?.kind ?? "main";

  const { screenToFlowPosition } = useReactFlow();
  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef   = useRef<DragState | null>(null);

  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [copiedX, setCopiedX] = useState(false);
  const [copiedY, setCopiedY] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Cycle Modal State
  const [showCycleModal, setShowCycleModal] = useState(false);
  const acceptUnsupervisedRun = useEditorStore(s => s.acceptUnsupervisedRun);
  const setAcceptUnsupervisedRun = useEditorStore(s => s.setAcceptUnsupervisedRun);

  const handleRunSequence = useCallback(async () => {
    try {
      await runSequence();
    } catch (e: any) {
      if (e?.message === "unsupervised-cycle-detected") {
        setShowCycleModal(true);
      } else {
        console.error(e);
      }
    }
  }, [runSequence]);

  // Help modal state
  const { open: helpOpen, kind: helpKind, setOpen: setHelpOpen, setKind: setHelpKind, registerRef } = useHelpModal();
  useEffect(() => { registerRef(); }, [registerRef]);

  useEffect(() => initEngineListeners(), []); // eslint-disable-line

  // Listen for open-help events from MacroBlockNode "?" button
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { kind?: string };
      if (detail?.kind) setHelpKind(detail.kind);
      setHelpOpen(true);
    };
    window.addEventListener("open-help", handler);
    return () => window.removeEventListener("open-help", handler);
  }, [setHelpOpen, setHelpKind]);

  // ── Raccourcis clavier globaux ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const inInput = tag === "input" || tag === "textarea";

      if (e.key === "F8") {
        e.preventDefault();
        invoke<{ x: number; y: number }>("get_cursor_position")
          .then(pos => {
            setCursorPos(pos);
            const state = useEditorStore.getState();
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            if (activeTab && state.selectedNodeId) {
              const node = activeTab.nodes.find(n => n.id === state.selectedNodeId);
              if (node) {
                const kind = node.data?.kind;
                if (kind === "mouse_move" || kind === "mouse_click" || kind === "mouse_scroll" || kind === "pixel_color" || kind === "ocr") {
                  state.updateNodeData(node.id, { x: String(pos.x), y: String(pos.y) });
                } else if (kind === "image_match") {
                  state.updateNodeData(node.id, { region_x: String(pos.x), region_y: String(pos.y) });
                }
              }
            }
          })
          .catch(() => {});
      }
      if (e.key === "F6") {
        e.preventDefault();
        const s = useEditorStore.getState().status;
        if (s === "running") stopSequence(); else handleRunSequence();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault(); saveActiveTab();
      }
      // UI Zoom Keyboard Shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        const saved = localStorage.getItem("autobot_ui_zoom");
        const z = saved ? Number(saved) : 100;
        const next = Math.min(150, z + 10);
        localStorage.setItem("autobot_ui_zoom", String(next));
        invoke("set_webview_zoom", { factor: next / 100 }).catch(err => console.error("Webview zoom error:", err));
        window.dispatchEvent(new CustomEvent("autobot-zoom-changed", { detail: next }));
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        const saved = localStorage.getItem("autobot_ui_zoom");
        const z = saved ? Number(saved) : 100;
        const next = Math.max(70, z - 10);
        localStorage.setItem("autobot_ui_zoom", String(next));
        invoke("set_webview_zoom", { factor: next / 100 }).catch(err => console.error("Webview zoom error:", err));
        window.dispatchEvent(new CustomEvent("autobot-zoom-changed", { detail: next }));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        localStorage.setItem("autobot_ui_zoom", "100");
        invoke("set_webview_zoom", { factor: 1.0 }).catch(err => console.error("Webview zoom error:", err));
        window.dispatchEvent(new CustomEvent("autobot-zoom-changed", { detail: 100 }));
      }
      if (!inInput) {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
          const tab = useEditorStore.getState().tabs.find(t => t.id === activeTabId);
          const sel = tab?.nodes.filter(n => n.selected).map(n => n.id) ?? [];
          if (sel.length > 0) copyNodes(sel);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "v") pasteNodes();
        if (e.key === "Escape") { setCtxMenu(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRunSequence, stopSequence, copyNodes, pasteNodes, saveActiveTab, activeTabId]);

  // ── Drag depuis la palette ────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const next = { ...dragRef.current, x: e.clientX, y: e.clientY };
      dragRef.current = next; setDrag({ ...next });
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const r = canvas.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (inside) addNode(d.kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }
      dragRef.current = null; setDrag(null);
    };
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup",   onUp,   { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup",   onUp,   { capture: true });
    };
  }, [addNode, screenToFlowPosition]);

  const startDrag = useCallback((kind: BlockKind, label: string, color: string, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const state = { kind, label, color, x: e.clientX, y: e.clientY };
    dragRef.current = state; setDrag(state);
  }, []);

  const onNodeClick  = useCallback((_: React.MouseEvent, node: Node) => selectNode(node.id), [selectNode]);
  const onPaneClick  = useCallback(() => { selectNode(null); setCtxMenu(null); }, [selectNode]);

  // ── Context menu handlers ─────────────────────────────────────────────────
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    selectNode(node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, [selectNode]);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const clientX = "clientX" in e ? e.clientX : 0;
    const clientY = "clientY" in e ? e.clientY : 0;
    setCtxMenu({ x: clientX, y: clientY });
  }, []);

  const handleCtxDelete = useCallback(() => {
    if (ctxMenu?.nodeId) removeNode(ctxMenu.nodeId);
  }, [ctxMenu, removeNode]);

  const handleCtxCopy = useCallback(() => {
    if (ctxMenu?.nodeId) copyNodes([ctxMenu.nodeId]);
  }, [ctxMenu, copyNodes]);

  // Palette filtrée selon le type d'onglet
  const paletteItems = BLOCK_CATALOG.filter(m => {
    if (m.paletteHidden) return false;
    if (m.mainOnly     && tabKind !== "main")     return false;
    if (m.functionOnly && tabKind !== "function") return false;
    return true;
  });

  const byCategory = paletteItems.reduce<Record<string, typeof BLOCK_CATALOG>>(
    (acc, m) => { (acc[m.category] ??= []).push(m); return acc; }, {}
  );


  return (
    <div style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%",
      background: "#09090b", overflow: "hidden",
      cursor: drag ? "grabbing" : "default",
      userSelect: drag ? "none" : "auto",
    }}>
      {/* ── Barre de menus ── */}
      <MenuBar onOpenHelp={() => setHelpOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />

      {/* ── Toolbar run/stop + status ── */}
      <Toolbar handleRun={handleRunSequence} />

      {/* ── Barre d'onglets ── */}
      <TabBar />

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── Palette ── */}
        <aside style={{
          width: 192, flexShrink: 0, background: "#0e0e10",
          borderRight: "0.5px solid #2a2a2e",
          display: "flex", flexDirection: "column",
          overflowY: "auto", position: "relative", zIndex: 10,
        }}>
          <div style={{ padding: "10px 13px 7px", borderBottom: "0.5px solid #2a2a2e" }}>
            <p style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#444" }}>
              Palette · glisser-déposer
            </p>
            {cursorPos && (
              <div style={{ display: "flex", gap: 4, marginTop: 5, marginBottom: 5 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(String(cursorPos.x));
                    setCopiedX(true);
                    setTimeout(() => setCopiedX(false), 800);
                  }}
                  style={{
                    flex: 1, padding: "2px 4px", fontSize: 9, background: "#18181b",
                    border: "0.5px solid #2a2a2e", borderRadius: 4, color: copiedX ? "#22C55E" : "#aaa",
                    cursor: "pointer", fontFamily: "monospace", display: "flex", justifyContent: "space-between"
                  }}
                >
                  <span>X: {cursorPos.x}</span>
                  {copiedX && <span>✓</span>}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(String(cursorPos.y));
                    setCopiedY(true);
                    setTimeout(() => setCopiedY(false), 800);
                  }}
                  style={{
                    flex: 1, padding: "2px 4px", fontSize: 9, background: "#18181b",
                    border: "0.5px solid #2a2a2e", borderRadius: 4, color: copiedY ? "#22C55E" : "#aaa",
                    cursor: "pointer", fontFamily: "monospace", display: "flex", justifyContent: "space-between"
                  }}
                >
                  <span>Y: {cursorPos.y}</span>
                  {copiedY && <span>✓</span>}
                </button>
              </div>
            )}
            <p style={{ fontSize: 9, color: "#2a2a2e", marginTop: 2 }}>
              F6 Run · Ctrl+S Sauver · F8 Pos
            </p>
            {tabKind === "function" && (
              <p style={{
                fontSize: 9, color: "#A855F799", marginTop: 4,
                padding: "3px 6px", background: "#A855F711",
                borderRadius: 4, border: "0.5px solid #A855F733",
              }}>
                <i className="ti ti-function" style={{ marginRight: 4 }} />
                Mode Fonction
              </p>
            )}
          </div>

          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <p style={{
                fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                color: "#3a3a3e", padding: "8px 13px 3px",
              }}>
                {CAT_LABELS[cat] ?? cat}
              </p>
              {items.map(meta => (
                <div
                  key={meta.kind}
                  onPointerDown={e => startDrag(meta.kind, meta.label, meta.color, e)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 13px", cursor: "grab",
                    fontSize: 11, color: "#bbb",
                    userSelect: "none", touchAction: "none",
                  }}
                  onMouseEnter={e => { if (!drag) e.currentTarget.style.background = "#18181b"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                  <span>{meta.label}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Boutons ouvrir en bas de palette */}
          <div style={{ marginTop: "auto", padding: "10px 13px", borderTop: "0.5px solid #1a1a1e" }}>
            <button
              onClick={() => openAny()}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 6,
                padding: "5px 8px", background: "none",
                border: "0.5px solid #2a2a2e", borderRadius: 5,
                cursor: "pointer", color: "#666", fontSize: 10, fontFamily: "monospace",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#E84C1E")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2e")}
            >
              <i className="ti ti-folder-open" style={{ fontSize: 11 }} /> Ouvrir…
            </button>
          </div>
        </aside>

        {/* ── Canvas React Flow ── */}
        <div ref={canvasRef} style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {drag && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
              border: "2px dashed #E84C1E55", background: "#E84C1E06", borderRadius: 4,
            }} />
          )}
          <ReactFlow<MacroNode, MacroEdge>
            key={activeTabId}
            nodes={nodes} edges={edges}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            deleteKeyCode="Delete"
            snapToGrid snapGrid={[20, 20]}
            fitView colorMode="dark"
            style={{ background: tabKind === "function" ? "#0c0a11" : "#0d0d0f" }}
            proOptions={{ hideAttribution: true }}
            panOnDrag={!drag}
          >
            <Background gap={20} size={1} color={tabKind === "function" ? "#12101a" : "#1a1a1d"} />
            <Controls style={{ background: "#18181b", border: "0.5px solid #2a2a2e" }} />
            <MiniMap
              nodeColor={n => (n.data as { color?: string })?.color ?? "#444"}
              maskColor="#09090bcc"
              style={{ background: "#0e0e10", border: "0.5px solid #2a2a2e" }}
            />
          </ReactFlow>
        </div>

        <Inspector />
      </div>

      <Console />

      {/* Ghost drag */}
      {drag && (
        <div style={{
          position: "fixed", left: drag.x - 88, top: drag.y - 18,
          pointerEvents: "none", zIndex: 9998,
          background: "#18181b", border: `1px solid ${drag.color}`,
          borderRadius: 8, padding: "6px 14px",
          fontSize: 11, fontFamily: "monospace", color: "#d0d0d0",
          boxShadow: "0 4px 24px #000b",
          display: "flex", alignItems: "center", gap: 7,
          opacity: 0.92, whiteSpace: "nowrap",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: drag.color, flexShrink: 0 }} />
          {drag.label}
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onDelete={handleCtxDelete}
          onCopy={handleCtxCopy}
          onPaste={pasteNodes}
        />
      )}

      {/* ── Help modal ── */}
      <HelpModal
        open={helpOpen}
        initialKind={helpKind}
        onClose={() => setHelpOpen(false)}
      />

      {/* ── Settings modal ── */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* ── Unsupervised Loop Warning Modal ── */}
      {showCycleModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "#000b", display: "flex",
          alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#18181b", border: "1px solid #E24B4A",
            borderRadius: 10, padding: 20, width: 450,
            fontFamily: "monospace", boxShadow: "0 10px 30px #000e"
          }}>
            <h3 style={{ color: "#E24B4A", display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
              <i className="ti ti-alert-triangle" />
              ATTENTION : Boucle Infinie Détectée
            </h3>
            <p style={{ fontSize: 11, color: "#ccc", lineHeight: 1.5, marginBottom: 16 }}>
              Votre séquence contient des connexions formant une boucle infinie non supervisée (sans nœud "Boucle FOR", "Itérations" ou "ForEach" intermédiaire). 
              <br /><br />
              Lancer l'exécution de cette boucle risque de saturer le processeur ou de faire planter l'application. Les connexions incriminées sont affichées en rouge.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <input
                id="accept-cycle-chk"
                type="checkbox"
                checked={acceptUnsupervisedRun}
                onChange={e => setAcceptUnsupervisedRun(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <label htmlFor="accept-cycle-chk" style={{ fontSize: 11, color: "#aaa", cursor: "pointer", userSelect: "none" }}>
                J'accepte le risque et autorise le lancement
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setShowCycleModal(false)}
                style={{
                  background: "transparent", border: "0.5px solid #2a2a2e",
                  borderRadius: 6, padding: "6px 14px", color: "#bbb",
                  fontSize: 11, cursor: "pointer"
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (acceptUnsupervisedRun) {
                    setShowCycleModal(false);
                    runSequence().catch(() => {});
                  }
                }}
                disabled={!acceptUnsupervisedRun}
                style={{
                  background: acceptUnsupervisedRun ? "#E24B4A" : "#222",
                  border: "none", borderRadius: 6, padding: "6px 14px",
                  color: acceptUnsupervisedRun ? "#fff" : "#555",
                  fontSize: 11, cursor: acceptUnsupervisedRun ? "pointer" : "not-allowed"
                }}
              >
                Lancer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <ReactFlowProvider><AppInner /></ReactFlowProvider>;
}
