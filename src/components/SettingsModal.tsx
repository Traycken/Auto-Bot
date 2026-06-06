import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppSettings {
  tesseract_path: string | null;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "ocr">("ocr");
  const [tesseractPath, setTesseractPath] = useState<string>("");
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      setTesseractPath(settings.tesseract_path || "");
      
      const detected = await invoke<string | null>("detect_tesseract_path");
      setDetectedPath(detected);
    } catch (err) {
      console.error("Erreur lors du chargement des paramètres:", err);
    }
  };

  const handleSave = async () => {
    try {
      setSaveStatus("Enregistrement...");
      await invoke("save_settings", {
        settings: {
          tesseract_path: tesseractPath.trim() || null,
        },
      });
      setSaveStatus("Paramètres enregistrés !");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      setSaveStatus(`Erreur: ${err}`);
    }
  };

  const triggerAutoDetect = async () => {
    setIsSearching(true);
    try {
      const path = await invoke<string | null>("detect_tesseract_path");
      setDetectedPath(path);
      if (path) {
        setTesseractPath(path);
        setSaveStatus("Tesseract détecté !");
        setTimeout(() => setSaveStatus(""), 2000);
      } else {
        alert("Tesseract-OCR n'a pas pu être détecté automatiquement.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  const S: Record<string, React.CSSProperties> = {
    overlay: {
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    },
    container: {
      width: 500, background: "#18181b", border: "1px solid #2a2a2e",
      borderRadius: 12, display: "flex", flexDirection: "column",
      boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)", overflow: "hidden",
      color: "#e4e4e7", fontFamily: "sans-serif",
    },
    header: {
      padding: "16px 20px", borderBottom: "1px solid #2a2a2e",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "#111113",
    },
    title: { fontSize: 16, fontWeight: 600, color: "#fff" },
    closeBtn: {
      background: "none", border: "none", color: "#a1a1aa",
      cursor: "pointer", fontSize: 18,
    },
    nav: {
      display: "flex", background: "#111113", borderBottom: "1px solid #2a2a2e",
      padding: "0 10px", gap: 5,
    },
    tabBtn: {
      padding: "12px 16px", background: "none", border: "none",
      borderBottom: "2px solid transparent", color: "#a1a1aa",
      cursor: "pointer", fontSize: 13, fontWeight: 500,
    },
    tabBtnActive: {
      color: "#E84C1E", borderBottomColor: "#E84C1E",
    },
    content: { padding: 20, flex: 1, minHeight: 250 },
    row: { marginBottom: 15 },
    label: { display: "block", fontSize: 12, color: "#a1a1aa", marginBottom: 6 },
    input: {
      width: "100%", padding: "8px 12px", background: "#0e0e10",
      border: "1px solid #2a2a2e", borderRadius: 6, color: "#fff",
      fontSize: 13, outline: "none", fontFamily: "monospace",
    },
    footer: {
      padding: "12px 20px", borderTop: "1px solid #2a2a2e",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "#111113",
    },
    btn: {
      padding: "8px 16px", borderRadius: 6, border: "1px solid #2a2a2e",
      background: "#0e0e10", color: "#fff", cursor: "pointer",
      fontSize: 13, fontWeight: 500, transition: "all 0.2s",
    },
    btnPrimary: {
      background: "#E84C1E", borderColor: "#E84C1E", color: "#fff",
    },
    badge: {
      display: "inline-block", padding: "3px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600,
    },
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>Paramètres</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Navigation */}
        <div style={S.nav}>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "general" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("general")}
          >
            Général
          </button>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "ocr" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("ocr")}
          >
            OCR (Tesseract)
          </button>
        </div>

        {/* Content */}
        <div style={S.content}>
          {activeTab === "general" && (
            <div>
              <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: "1.5" }}>
                Paramètres généraux d'Auto Bot. D'autres options seront bientôt configurables ici.
              </p>
            </div>
          )}

          {activeTab === "ocr" && (
            <div>
              <div style={S.row}>
                <span style={S.label}>Statut de Tesseract-OCR</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {detectedPath ? (
                    <span style={{ ...S.badge, background: "#1d9e7522", color: "#1d9e75", border: "1px solid #1d9e75" }}>
                      ✓ Détecté sur le système
                    </span>
                  ) : (
                    <span style={{ ...S.badge, background: "#e24b4a22", color: "#e24b4a", border: "1px solid #e24b4a" }}>
                      ✗ Non détecté automatiquement
                    </span>
                  )}
                  <button
                    onClick={triggerAutoDetect}
                    disabled={isSearching}
                    style={{ ...S.btn, padding: "4px 10px", fontSize: 11 }}
                  >
                    {isSearching ? "Recherche..." : "Re-détecter"}
                  </button>
                </div>
              </div>

              <div style={S.row}>
                <span style={S.label}>Chemin d'accès vers tesseract.exe</span>
                <input
                  type="text"
                  value={tesseractPath}
                  onChange={(e) => setTesseractPath(e.target.value)}
                  placeholder="Ex: C:\Program Files\Tesseract-OCR\tesseract.exe"
                  style={S.input}
                />
              </div>

              {!detectedPath && !tesseractPath && (
                <div style={{
                  padding: 12, background: "#e24b4a11", border: "1px solid #e24b4a44",
                  borderRadius: 6, fontSize: 12, color: "#fca5a5", lineHeight: "1.4"
                }}>
                  <strong>Tesseract-OCR est manquant :</strong> Pour pouvoir extraire et analyser le texte de l'écran, vous devez installer Tesseract.
                  <br />
                  <a
                    href="https://github.com/UB-Mannheim/tesseract/wiki"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#E84C1E", textDecoration: "underline", display: "inline-block", marginTop: 5 }}
                  >
                    Télécharger l'installateur Windows (.exe)
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{saveStatus}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} onClick={onClose}>Annuler</button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={handleSave}>Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
