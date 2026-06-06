import { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "../store/editorStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type LogLevel = "log" | "info" | "warn" | "error" | "tauri" | "store";

interface ConsoleLine {
  id: number;
  ts: string;
  level: LogLevel;
  msg: string;
}

let lineId = 0;
const fmt = () => new Date().toLocaleTimeString("fr-FR", { hour12: false });

// ── Color map ─────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<LogLevel, string> = {
  log:   "#aaa",
  info:  "#64b5f6",
  warn:  "#EF9F27",
  error: "#E24B4A",
  tauri: "#1D9E75",
  store: "#c792ea",
};

const LEVEL_BG: Record<LogLevel, string> = {
  log:   "transparent",
  info:  "transparent",
  warn:  "#EF9F2710",
  error: "#E24B4A14",
  tauri: "#1D9E7510",
  store: "#c792ea10",
};

// ── Global log bus (outside React so native console can push here) ─────────────

type Subscriber = (line: ConsoleLine) => void;
const subscribers: Subscriber[] = [];
export function pushDebugLine(level: LogLevel, ...args: unknown[]) {
  const msg = args.map((a) =>
    typeof a === "object" ? JSON.stringify(a, null, 0) : String(a)
  ).join(" ");
  const line: ConsoleLine = { id: ++lineId, ts: fmt(), level, msg };
  subscribers.forEach((s) => s(line));
}

// ── Intercept native console ──────────────────────────────────────────────────

const _orig = {
  log:   console.log.bind(console),
  info:  console.info.bind(console),
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
};

function patchConsole() {
  (["log", "info", "warn", "error"] as const).forEach((lvl) => {
    console[lvl] = (...args: unknown[]) => {
      _orig[lvl](...args);
      pushDebugLine(lvl, ...args);
    };
  });
}

// Call once at module load
patchConsole();

// ── Component ─────────────────────────────────────────────────────────────────

export function DebugConsole() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [height, setHeight] = useState(240);
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // Subscribe to the global bus
  useEffect(() => {
    const sub: Subscriber = (line) =>
      setLines((prev) => [...prev.slice(-499), line]);
    subscribers.push(sub);

    // Welcome message
    pushDebugLine("info", "🤖 Auto Bot debug console ready");
    pushDebugLine("info", `Tauri: ${typeof (window as unknown as Record<string, unknown>)["__TAURI__"] !== "undefined" ? "✓ détecté" : "✗ non détecté (dev browser?)"}`);

    return () => {
      const idx = subscribers.indexOf(sub);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }, []);

  // Store snapshot on every state change
  const { nodes, edges, status } = useEditorStore();
  useEffect(() => {
    pushDebugLine("store", `nodes:${nodes.length} edges:${edges.length} status:${status}`);
  }, [nodes.length, edges.length, status]);

  // Auto-scroll
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "instant" });
  }, [lines, open]);

  // ── Resize drag ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    setDragging(true);
  }, [height]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = dragStartY.current - e.clientY;
      setHeight(Math.max(80, Math.min(600, dragStartH.current + delta)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const LEVELS: Array<LogLevel | "all"> = ["all", "log", "info", "warn", "error", "tauri", "store"];
  const filtered = filter === "all" ? lines : lines.filter((l) => l.level === filter);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      zIndex: 9999,
      pointerEvents: "none", // let clicks pass through when closed
    }}>
      {/* ── Resize handle ── */}
      {open && (
        <div
          onMouseDown={onMouseDown}
          style={{
            height: 5,
            cursor: "ns-resize",
            background: dragging ? "#E84C1E44" : "transparent",
            pointerEvents: "all",
            borderTop: "1px solid #2a2a2e",
          }}
        />
      )}

      <div style={{
        background: "#09090b",
        borderTop: open ? "none" : "0.5px solid #2a2a2e",
        pointerEvents: "all",
      }}>
        {/* ── Header bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px",
          background: "#0e0e10",
          borderTop: "0.5px solid #2a2a2e",
          userSelect: "none",
        }}>
          {/* Toggle */}
          <button
            onClick={() => setOpen((o) => !o)}
            title={open ? "Réduire" : "Ouvrir la console"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#666", fontSize: 13, padding: "2px 4px",
              display: "flex", alignItems: "center",
            }}
          >
            <i className={`ti ${open ? "ti-chevron-down" : "ti-chevron-up"}`} />
          </button>

          <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555" }}>
            Console de debug
          </span>

          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 10,
            background: "#18181b", border: "0.5px solid #2a2a2e", color: "#555",
          }}>
            {lines.length} lignes
          </span>

          {/* Level filters */}
          <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "monospace",
                  background: filter === lvl ? (lvl === "all" ? "#333" : LEVEL_BG[lvl as LogLevel]) : "transparent",
                  border: `0.5px solid ${filter === lvl ? (lvl === "all" ? "#555" : LEVEL_COLOR[lvl as LogLevel]) : "#2a2a2e"}`,
                  color: filter === lvl ? (lvl === "all" ? "#ccc" : LEVEL_COLOR[lvl as LogLevel]) : "#555",
                }}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Diagnostics button */}
          <button
            onClick={() => {
              const state = useEditorStore.getState();
              pushDebugLine("store", `SNAPSHOT — nodes: ${JSON.stringify(state.nodes.map(n => ({ id: n.id, kind: n.data.kind })))}`);
              pushDebugLine("store", `edges: ${JSON.stringify(state.edges.map(e => `${e.source}[${e.sourceHandle??''}]→${e.target}[${e.targetHandle??''}]`))}`);
              pushDebugLine("store", `vars: ${JSON.stringify(state.variables)}`);
              pushDebugLine("store", `status: ${state.status}`);
              pushDebugLine("info", `window.__TAURI__: ${typeof (window as { __TAURI__?: unknown }).__TAURI__}`);
            }}
            style={{
              fontSize: 9, padding: "2px 8px", cursor: "pointer",
              background: "none", border: "0.5px solid #2a2a2e",
              borderRadius: 6, color: "#555", fontFamily: "monospace",
            }}
          >
            snapshot
          </button>

          {/* Clear */}
          <button
            onClick={() => setLines([])}
            style={{
              fontSize: 9, padding: "2px 8px", cursor: "pointer",
              background: "none", border: "0.5px solid #2a2a2e",
              borderRadius: 6, color: "#555", fontFamily: "monospace",
            }}
          >
            effacer
          </button>
        </div>

        {/* ── Log body ── */}
        {open && (
          <div style={{
            height,
            overflowY: "auto",
            padding: "4px 0",
            fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
            fontSize: 11,
          }}>
            {filtered.length === 0 && (
              <div style={{ color: "#333", padding: "8px 14px" }}>— aucune entrée —</div>
            )}
            {filtered.map((line) => (
              <div
                key={line.id}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "1px 14px",
                  background: LEVEL_BG[line.level],
                  borderLeft: `2px solid ${line.level !== "log" ? LEVEL_COLOR[line.level] : "transparent"}`,
                }}
              >
                <span style={{ color: "#333", flexShrink: 0, fontSize: 10 }}>{line.ts}</span>
                <span style={{
                  color: "#444", flexShrink: 0, fontSize: 9,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  paddingTop: 1, minWidth: 36,
                }}>
                  {line.level}
                </span>
                <span style={{ color: LEVEL_COLOR[line.level], wordBreak: "break-all", lineHeight: 1.5 }}>
                  {line.msg}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
