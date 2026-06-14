import { useState } from "react";
import { useEditorStore, t } from "../store/editorStore";

const S = {
  input: {
    width: "100%", padding: "4px 7px", fontSize: 11, fontFamily: "monospace",
    background: "#111113", border: "0.5px solid #2a2a2e", borderRadius: 5,
    color: "#d0d0d0", outline: "none", boxSizing: "border-box",
  } as React.CSSProperties,
};

export function VarPanel() {
  const { variables, setVariable, removeVariable } = useEditorStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const commit = () => {
    const name = newName.trim().replace(/\s+/g, "_");
    if (!name) return;
    setVariable(name, newVal, newDesc);
    setNewName(""); setNewVal(""); setNewDesc("");
    setAdding(false);
  };

  return (
    <div style={{ padding: "10px 12px", borderBottom: "0.5px solid #2a2a2e" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555" }}>
          {t("vars.title", "Variables globales")}
        </span>
        <button
          onClick={() => setAdding((a) => !a)}
          style={{
            fontSize: 10, padding: "2px 7px", cursor: "pointer",
            background: adding ? "#E84C1E22" : "none",
            border: `0.5px solid ${adding ? "#E84C1E" : "#2a2a2e"}`,
            borderRadius: 5, color: adding ? "#E84C1E" : "#666", fontFamily: "monospace",
          }}
        >
          {adding ? t("vars.cancel", "✕ annuler") : t("vars.add", "+ ajouter")}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ marginBottom: 8, padding: 8, background: "#111113", borderRadius: 6, border: "0.5px solid #2a2a2e" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <input placeholder={t("vars.name", "nom")} value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ ...S.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && commit()} />
            <input placeholder={t("vars.value", "valeur")} value={newVal} onChange={(e) => setNewVal(e.target.value)}
              style={{ ...S.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && commit()} />
          </div>
          <input placeholder={t("vars.description_optional", "description (optionnel)")} value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            style={{ ...S.input, marginBottom: 6 }} onKeyDown={(e) => e.key === "Enter" && commit()} />
          <button onClick={commit} style={{
            width: "100%", padding: "4px 0", cursor: "pointer", fontSize: 11, fontFamily: "monospace",
            background: "#E84C1E22", border: "0.5px solid #E84C1E", borderRadius: 5, color: "#E84C1E",
          }}>{t("vars.create", "Créer variable")}</button>
        </div>
      )}

      {/* Variable list */}
      {variables.length === 0 && !adding && (
        <p style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>{t("vars.empty", "aucune variable")}</p>
      )}

      {variables.map((v) => (
        <div key={v.name} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 0", borderBottom: "0.5px solid #1a1a1e",
        }}>
          <span style={{ color: "#c792ea", fontSize: 10, fontWeight: 600, minWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>
            %{v.name}
          </span>
          <input
            value={v.value}
            onChange={(e) => setVariable(v.name, e.target.value, v.description)}
            style={{ ...S.input, flex: 1, padding: "2px 5px" }}
          />
          <button
            onClick={() => removeVariable(v.name)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#444", fontSize: 12, padding: "0 2px", lineHeight: 1 }}
          >×</button>
        </div>
      ))}

      {variables.length > 0 && (
        <p style={{ fontSize: 9, color: "#333", marginTop: 5, fontFamily: "monospace" }}>
          {t("vars.hint", "Utiliser %nom dans n'importe quel champ. %% = signe %.")}
        </p>
      )}
    </div>
  );
}
