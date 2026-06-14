import { useEditorStore, t, type CmdLogEntry } from "../store/editorStore";

interface Props {
  nodeId: string;
  onClose: () => void;
}

function entryBlock(entry: CmdLogEntry, i: number) {
  const isFailed = entry.exit_code !== null && entry.exit_code !== 0;
  const asyncRun = entry.async === true;
  return (
    <div key={i} style={{
      marginBottom: 10, padding: 10, background: "#111113",
      border: "0.5px solid #2a2a2e", borderRadius: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "#64748B" }}>{entry.timestamp}</span>
        <span style={{ fontSize: 10, color: asyncRun ? "#378ADD" : isFailed ? "#E24B4A" : "#22C55E" }}>
          {asyncRun ? "async" : `exit ${entry.exit_code ?? "?"}`}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#888", marginBottom: 6, wordBreak: "break-all" }}>
        $ {entry.command}
      </div>
      {entry.stdout && (
        <pre style={{ fontSize: 10, color: "#ccc", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {entry.stdout}
        </pre>
      )}
      {entry.stderr && (
        <pre style={{ fontSize: 10, color: isFailed ? "#E24B4A" : "#888", margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {entry.stderr}
        </pre>
      )}
    </div>
  );
}

export function CmdHistoryModal({ nodeId, onClose }: Props) {
  const history = useEditorStore(s => s.cmdHistory[nodeId] ?? []);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
    >
      <div style={{
        width: 560, maxHeight: "70vh", background: "#0e0e10",
        border: "0.5px solid #2a2a2e", borderRadius: 10,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: "0.5px solid #2a2a2e",
        }}>
          <span style={{ fontSize: 12, color: "#ccc", fontFamily: "monospace" }}>
            <i className="ti ti-terminal-2" style={{ marginRight: 6 }} />
            {t("cmd.history_title", "Historique console")}
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {history.length === 0 ? (
            <p style={{ fontSize: 11, color: "#444", textAlign: "center", marginTop: 30 }}>
              {t("cmd.no_execution", "Aucune exécution enregistrée pour ce bloc.")}
            </p>
          ) : (
            [...history].reverse().map((entry, i) => entryBlock(entry, i))
          )}
        </div>
      </div>
    </div>
  );
}
