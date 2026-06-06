import { useEditorStore } from "../store/editorStore";

export function Toolbar() {
  const {
    tabs, activeTabId,
    status, runSequence, stopSequence,
    saveActiveTab, openSequence,
  } = useEditorStore();

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isRunning  = status === "running";
  const isMain     = activeTab?.kind === "main";
  const nodeCount  = activeTab?.nodes.length ?? 0;
  const isEmpty    = nodeCount === 0;

  const statusColor: Record<string, string> = {
    idle: "#1D9E75", running: "#EF9F27", stopped: "#888", error: "#E24B4A",
  };
  const statusLabel: Record<string, string> = {
    idle: "Prêt", running: "En cours…", stopped: "Arrêté", error: "Erreur",
  };

  const btn = (onClick: () => void, icon: string, label: string, disabled = false, accent = false, title?: string): React.ReactElement => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px",
        background: accent ? "#E84C1E" : "none",
        color: accent ? "#fff" : "#888",
        border: `0.5px solid ${accent ? "#E84C1E" : "#2a2a2e"}`,
        borderRadius: 6, fontSize: 12, fontFamily: "monospace",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { if (!disabled && !accent) (e.currentTarget as HTMLButtonElement).style.background = "#18181b"; }}
      onMouseLeave={e => { if (!accent) (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
      {label}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 12px",
      background: "#0e0e10",
      borderBottom: "0.5px solid #2a2a2e",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:7, marginRight:6 }}>
        <div style={{ width:22, height:22, borderRadius:6, background:"#E84C1E", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-robot" style={{ color:"#fff", fontSize:13 }} />
        </div>
        <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:500, color:"#e0e0e0", letterSpacing:"0.04em" }}>Auto Bot</span>
        <span style={{ fontSize:9, color:"#333" }}>v0.1</span>
      </div>

      <div style={{ width:"0.5px", height:18, background:"#2a2a2e", margin:"0 2px" }} />

      {/* Run / Stop — only for main tabs */}
      {isMain ? btn(
        () => { isRunning ? stopSequence() : runSequence(); },
        isRunning ? "ti-player-stop" : "ti-player-play",
        isRunning ? "Stop" : "Exécuter",
        isEmpty && !isRunning,
        !isRunning,
        "F6",
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", fontSize:11, fontFamily:"monospace", color:"#3a2a4e", border:"0.5px solid #2a1a3e", borderRadius:6 }}>
          <i className="ti ti-function" style={{ fontSize:12, color:"#A855F7" }} />
          <span style={{ color:"#A855F7" }}>Fonction</span>
        </div>
      )}

      <div style={{ width:"0.5px", height:18, background:"#2a2a2e", margin:"0 2px" }} />

      {btn(() => saveActiveTab(), "ti-device-floppy", "Sauver", false, false, "Ctrl+S")}
      {btn(() => openSequence(), "ti-folder-open", "Ouvrir")}

      <div style={{ flex: 1 }} />

      {/* Status pill */}
      <div style={{
        display:"flex", alignItems:"center", gap:5,
        padding:"3px 10px",
        background:"#18181b", border:"0.5px solid #2a2a2e", borderRadius:20,
        fontSize:11, fontFamily:"monospace", color:"#888",
      }}>
        <span style={{
          width:6, height:6, borderRadius:"50%",
          background: isMain ? (statusColor[status] ?? "#888") : "#A855F7",
          boxShadow: isRunning ? `0 0 6px ${statusColor.running}` : "none",
        }} />
        {isMain ? (statusLabel[status] ?? status) : "Fonction"}
      </div>

      <span style={{ fontSize:10, color:"#3a3a3e", fontFamily:"monospace" }}>
        F6 run · Ctrl+S sauver
      </span>

      <span style={{ fontSize:10, color:"#333", fontFamily:"monospace", marginLeft:4 }}>
        {nodeCount} nœud{nodeCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
