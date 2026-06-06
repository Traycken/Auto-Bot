import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";

const LEVEL_COLOR: Record<string, string> = {
  info: "#555",
  ok: "#1D9E75",
  error: "#E24B4A",
  run: "#E84C1E",
};

export function LogPanel() {
  const { log, clearLog } = useEditorStore();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{
      height: 110,
      background: "#09090b",
      borderTop: "0.5px solid #2a2a2e",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 14px",
        borderBottom: "0.5px solid #1a1a1d",
      }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444" }}>
          Journal d'exécution
        </span>
        <button
          onClick={clearLog}
          style={{ background: "none", border: "none", color: "#444", fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}
        >
          effacer
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {log.length === 0 && (
          <p style={{ fontSize: 10, color: "#333", fontFamily: "monospace", marginTop: 4 }}>
            — en attente d'exécution —
          </p>
        )}
        {log.map((entry) => (
          <div
            key={entry.ts}
            style={{
              display: "flex", gap: 10, alignItems: "baseline",
              fontSize: 10, fontFamily: "monospace", marginBottom: 2,
            }}
          >
            <span style={{ color: "#333", flexShrink: 0 }}>{fmt(entry.ts)}</span>
            <span style={{ color: LEVEL_COLOR[entry.level] ?? "#888" }}>{entry.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
