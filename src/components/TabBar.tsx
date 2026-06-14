import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorStore, t } from "../store/editorStore";

export function TabBar() {
  const {
    tabs, activeTabId,
    setActiveTab, closeTab, addMainTab, addFunctionTab, renameTab, saveActiveTab,
  } = useEditorStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState("");
  const [showModal, setShowModal]  = useState(false);
  const [funcName, setFuncName] = useState("ma_fonction");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);

  const handleNewSequence = useCallback(() => {
    setShowModal(false);
    addMainTab();
  }, [addMainTab]);

  const handleNewFunction = useCallback(() => {
    if (funcName.trim()) {
      addFunctionTab(funcName.trim());
      setShowModal(false);
      setFuncName("ma_fonction");
    }
  }, [addFunctionTab, funcName]);

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameVal(name);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) renameTab(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: "#0a0a0c",
      borderBottom: "0.5px solid #1e1e22",
      height: 34,
      overflowX: "auto", overflowY: "hidden",
      flexShrink: 0,
      scrollbarWidth: "none",
    }}>

      {/* ── Onglets ──────────────────────────────────────────────────────── */}
      {tabs.map(tab => {
        const active     = tab.id === activeTabId;
        const isFn       = tab.kind === "function";
        const accent     = isFn ? "#A855F7" : "#E84C1E";

        return (
          <div
            key={tab.id}
            onClick={() => { if (!renamingId) setActiveTab(tab.id); }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 8px 0 10px", height: "100%",
              minWidth: 90, maxWidth: 180,
              cursor: "pointer",
              background: active ? "#13131a" : "transparent",
              borderRight: "0.5px solid #1e1e22",
              borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
              flexShrink: 0, userSelect: "none",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#111115"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <i
              className={`ti ${isFn ? "ti-function" : "ti-layout-board"}`}
              style={{ fontSize: 10, color: active ? accent : "#444", flexShrink: 0 }}
            />

            {renamingId === tab.id ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === "Enter")  commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, minWidth: 0, background: "transparent",
                  border: "none", outline: `1px solid ${accent}`,
                  color: "#e0e0e0", fontSize: 11, fontFamily: "monospace",
                  borderRadius: 3, padding: "1px 3px",
                }}
              />
            ) : (
              <span
                onDoubleClick={e => startRename(tab.id, tab.name, e)}
                title={`${t("tab.double_click_rename", "Double-clic pour renommer")}${tab.filePath ? ` · ${tab.filePath}` : ""}`}
                style={{
                  flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontSize: 11, fontFamily: "monospace",
                  color: active ? "#e0e0e0" : "#666",
                }}
              >
                {tab.name}
              </span>
            )}

            {tab.dirty && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0 }} />
            )}

            {active && (
              <>
                <button
                  onClick={e => startRename(tab.id, tab.name, e)}
                  title={t("tab.rename", "Renommer l'onglet")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: "0 2px", flexShrink: 0, display: "flex", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#444")}
                >
                  <i className="ti ti-pencil" style={{ fontSize: 10 }} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); saveActiveTab(); }}
                  title={t("tab.save", "Sauvegarder (Ctrl+S)")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: "0 2px", flexShrink: 0, display: "flex", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#aaa")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#444")}
                >
                  <i className="ti ti-device-floppy" style={{ fontSize: 10 }} />
                </button>
              </>
            )}

            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                title={t("tab.close", "Fermer")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: "0 2px", flexShrink: 0, fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E24B4A")}
                onMouseLeave={e => (e.currentTarget.style.color = "#444")}
              >×</button>
            )}
          </div>
        );
      })}

      {/* ── Bouton + ─────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setShowModal(true)}
          title={t("tab.new", "Nouvel onglet")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34,
            background: "none",
            border: "none", cursor: "pointer",
            color: "#555", fontSize: 16,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#e0e0e0")}
          onMouseLeave={e => (e.currentTarget.style.color = "#555")}
        >
          <i className="ti ti-plus" />
        </button>
      </div>

      {/* ── Modal de Sélection d'onglet ── */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 100000,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <div style={{
            background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: 12,
            padding: 24, width: 480, maxWidth: "90%", display: "flex", flexDirection: "column", gap: 18,
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)", fontFamily: "monospace"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#fff", fontWeight: "bold" }}>{t("tab.create_new", "Créer un nouvel onglet")}</span>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#666", fontSize: 18 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.color = "#666")}
              >×</button>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              {/* Carte Séquence */}
              <div
                onClick={handleNewSequence}
                style={{
                  flex: 1, background: "#111113", border: "1px solid #E84C1E33", borderRadius: 8,
                  padding: 16, cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 10, transition: "transform 0.15s, border-color 0.15s"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#E84C1E";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#E84C1E33";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E84C1E15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-layout-board" style={{ fontSize: 20, color: "#E84C1E" }} />
                </div>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: "bold" }}>{t("tab.new_sequence", "Nouvelle Séquence")}</span>
                <span style={{ fontSize: 9, color: "#555", textAlign: "center" }}>{t("tab.new_sequence_desc", "Scénario macro standard exécuté séquentiellement.")}</span>
              </div>

              {/* Carte Fonction */}
              <div
                style={{
                  flex: 1, background: "#111113", border: "1px solid #A855F733", borderRadius: 8,
                  padding: 16, display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 10, transition: "transform 0.15s, border-color 0.15s"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#A855F7";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#A855F733";
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#A855F715", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-function" style={{ fontSize: 20, color: "#A855F7" }} />
                </div>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: "bold" }}>{t("tab.new_function", "Nouvelle Fonction")}</span>
                
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 8, color: "#555" }}>{t("tab.function_name", "Nom de fonction :")}</span>
                  <input
                    type="text"
                    value={funcName}
                    onChange={e => setFuncName(e.target.value)}
                    style={{
                      width: "100%", padding: "4px 8px", fontSize: 10, fontFamily: "monospace",
                      background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: 5, color: "#d0d0d0",
                      outline: "none", boxSizing: "border-box"
                    }}
                  />
                </div>

                <button
                  onClick={handleNewFunction}
                  disabled={!funcName.trim()}
                  style={{
                    width: "100%", padding: "5px", background: "#A855F722", border: "0.5px solid #A855F7",
                    borderRadius: 5, color: "#A855F7", fontSize: 10, cursor: "pointer", fontWeight: "bold",
                    marginTop: 4
                  }}
                >
                  {t("tab.create_function", "Créer la fonction")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
