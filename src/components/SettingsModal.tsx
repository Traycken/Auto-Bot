import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editorStore";
// import { message } from "@tauri-apps/plugin-dialog";
const message = (msg: string, _opts?: any) => {
  alert(msg);
  return Promise.resolve();
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutSetting {
  combo: string;
  file_path: string;
}

interface PythonEnvSetting {
  name: string;
  dir: string;
}

interface AppSettings {
  tesseract_path: string | null;
  shortcuts: ShortcutSetting[];
  python_envs: PythonEnvSetting[];
  edge_thickness?: number;
  language?: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { setEdgeThickness: setStoreEdgeThickness, t, loadTranslations } = useEditorStore();
  const [activeTab, setActiveTab] = useState<"general" | "ocr" | "shortcuts" | "python">("general");
  const [tesseractPath, setTesseractPath] = useState<string>("");
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [shortcuts, setShortcuts] = useState<ShortcutSetting[]>([]);
  const [pythonEnvs, setPythonEnvs] = useState<PythonEnvSetting[]>([]);
  const [edgeThicknessLocal, setEdgeThicknessLocal] = useState<number>(4);
  const [language, setLanguage] = useState<string>("fr");
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isRecreatingVenv, setIsRecreatingVenv] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      setTesseractPath(settings.tesseract_path || "");
      setShortcuts(settings.shortcuts || []);
      setPythonEnvs(settings.python_envs || []);
      const et = settings.edge_thickness ?? 4;
      setEdgeThicknessLocal(et);
      setStoreEdgeThickness(et);
      setLanguage(settings.language || "fr");
      
      const detected = await invoke<string | null>("detect_tesseract_path");
      setDetectedPath(detected);
    } catch (err) {
      console.error("Erreur lors du chargement des paramètres:", err);
    }
  };

  const handleSave = async () => {
    try {
      setSaveStatus(t("settings.saving", "Enregistrement..."));
      await invoke("save_settings", {
        settings: {
          tesseract_path: tesseractPath.trim() || null,
          shortcuts: shortcuts.filter(s => s.combo.trim() !== "" && s.file_path.trim() !== ""),
          python_envs: pythonEnvs.filter(env => env.name.trim() !== "" && env.dir.trim() !== ""),
          edge_thickness: edgeThicknessLocal,
          language: language,
        },
      });
      setStoreEdgeThickness(edgeThicknessLocal);
      await loadTranslations(language);
      setSaveStatus(t("settings.saved", "Paramètres enregistrés !"));
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      setSaveStatus(`${t("settings.error", "Erreur")}: ${err}`);
    }
  };

  const handleAddShortcut = () => {
    setShortcuts(prev => [...prev, { combo: "", file_path: "" }]);
  };

  const handleRemoveShortcut = (index: number) => {
    setShortcuts(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateShortcut = (index: number, field: keyof ShortcutSetting, value: string) => {
    setShortcuts(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleBrowseShortcut = async (index: number) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: t("settings.shortcuts.browse_title", "Choisir un fichier de séquence (.absqc)"),
        filters: [{ name: t("settings.shortcuts.file_filter_name", "Séquence Auto-Bot"), extensions: ["absqc"] }],
        multiple: false,
        directory: false,
      });
      if (path && typeof path === "string") {
        handleUpdateShortcut(index, "file_path", path);
      }
    } catch (err) {
      console.error("Erreur de dialogue:", err);
    }
  };

  const handleAddPythonEnv = () => {
    setPythonEnvs(prev => [...prev, { name: "", dir: "" }]);
  };

  const handleRemovePythonEnv = (index: number) => {
    setPythonEnvs(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePythonEnv = (index: number, field: keyof PythonEnvSetting, value: string) => {
    setPythonEnvs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleBrowsePythonDir = async (index: number) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: t("settings.python.browse_title", "Choisir le dossier de l'environnement Python"),
        multiple: false,
        directory: true,
      });
      if (path && typeof path === "string") {
        handleUpdatePythonEnv(index, "dir", path);
      }
    } catch (err) {
      console.error("Erreur de dialogue dossier:", err);
    }
  };

  const triggerAutoDetect = async () => {
    setIsSearching(true);
    try {
      const path = await invoke<string | null>("detect_tesseract_path");
      setDetectedPath(path);
      if (path) {
        setTesseractPath(path);
        setSaveStatus(t("settings.ocr.detected", "Tesseract détecté !"));
        setTimeout(() => setSaveStatus(""), 2000);
      } else {
        await message(t("settings.ocr.not_detected_alert", "Tesseract-OCR n'a pas pu être détecté automatiquement."), { kind: "warning" });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  const LANGUAGES = [
    { code: "fr", name: "Français (French)", flag: "https://flagcdn.com/fr.svg" },
    { code: "en", name: "English (Anglais)", flag: "https://flagcdn.com/gb.svg" }
  ];

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
      color: "#E84C1E", borderBottom: "2px solid #E84C1E",
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
          <span style={S.title}>{t("settings.title", "Paramètres")}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Navigation */}
        <div style={S.nav}>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "general" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("general")}
          >
            {t("settings.tab.general", "Général")}
          </button>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "ocr" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("ocr")}
          >
            {t("settings.tab.ocr", "OCR (Tesseract)")}
          </button>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "python" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("python")}
          >
            {t("settings.tab.python", "Python")}
          </button>
          <button
            style={{ ...S.tabBtn, ...(activeTab === "shortcuts" ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab("shortcuts")}
          >
            {t("settings.tab.shortcuts", "Raccourcis")}
          </button>
        </div>

        {/* Content */}
        <div style={S.content}>
          {activeTab === "general" && (
            <div>
              <div style={S.row}>
                <span style={S.label}>{t("settings.general.edge_thickness", "Épaisseur des connexions (edges) :")} {edgeThicknessLocal}px</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={edgeThicknessLocal}
                  onChange={(e) => setEdgeThicknessLocal(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#E84C1E", marginBottom: 15 }}
                />
              </div>
              <div style={S.row}>
                <span style={S.label}>{t("settings.general.language", "Langue de l'interface")}</span>
                <div style={{ position: "relative", width: "100%", marginBottom: 15 }}>
                  <div
                    onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                    style={{
                      ...S.input,
                      background: "#0e0e10",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      userSelect: "none"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img
                        src={language === "fr" ? "https://flagcdn.com/fr.svg" : "https://flagcdn.com/gb.svg"}
                        alt={language}
                        style={{ width: 18, height: 13, borderRadius: 2, objectFit: "cover" }}
                      />
                      <span>{language === "fr" ? "Français (French)" : "English (Anglais)"}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "#666" }}>▼</span>
                  </div>
                  {isLangDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "105%",
                        left: 0,
                        right: 0,
                        background: "#111113",
                        border: "1px solid #2a2a2e",
                        borderRadius: 6,
                        zIndex: 100,
                        overflow: "hidden",
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.5)"
                      }}
                    >
                      {LANGUAGES.map((lang) => (
                        <div
                          key={lang.code}
                          onClick={() => {
                            setLanguage(lang.code);
                            setIsLangDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            cursor: "pointer",
                            background: language === lang.code ? "#E84C1E15" : "transparent",
                            transition: "background 0.2s",
                            color: "#fff"
                          }}
                          onMouseEnter={(e) => {
                            if (language !== lang.code) {
                              e.currentTarget.style.background = "#2a2a2e";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (language !== lang.code) {
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                        >
                          <img
                            src={lang.flag}
                            alt={lang.name}
                            style={{ width: 18, height: 13, borderRadius: 2, objectFit: "cover" }}
                          />
                          <span>{lang.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={S.row}>
                <span style={S.label}>{t("settings.general.yolo_venv", "Environnement Virtuel YOLO")}</span>
                <button
                  onClick={async () => {
                    try {
                      setIsRecreatingVenv(true);
                      await invoke("recreate_yolo_venv");
                      await message(t("settings.general.yolo_recreated_success", "L'environnement virtuel YOLO a été recréé avec succès !"), { title: "YOLO Venv" });
                    } catch (err) {
                      await message(t("settings.general.yolo_recreated_error", "Erreur lors de la recréation du venv : ") + String(err), { kind: "error" });
                    } finally {
                      setIsRecreatingVenv(false);
                    }
                  }}
                  disabled={isRecreatingVenv}
                  style={{
                    ...S.btn,
                    width: "100%",
                    background: isRecreatingVenv ? "#E84C1E33" : "#0e0e10",
                    borderColor: "#2a2a2e",
                    color: isRecreatingVenv ? "#aaa" : "#fff",
                    fontWeight: "bold",
                    padding: "10px",
                  }}
                >
                  <i className="ti ti-refresh" style={{ marginRight: 5 }} />
                  {isRecreatingVenv ? t("settings.general.yolo_recreating", "Recréation de l'environnement virtuel (Pip install...) ...") : t("settings.general.yolo_recreate_btn", "Recréer l'environnement virtuel YOLO")}
                </button>
                <p style={{ fontSize: 10, color: "#666", marginTop: 5, lineHeight: "1.4" }}>
                  {t("settings.general.yolo_desc", "Supprime et reconstruit le dossier YOLO\\.venv en réinstallant les dépendances nécessaires (Ultralytics, Torch, OpenCV...). Utilisez ce bouton en cas de corruption ou de problème avec l'exportation YOLO.")}
                </p>
              </div>
            </div>
          )}

          {activeTab === "ocr" && (
            <div>
              <div style={S.row}>
                <span style={S.label}>{t("settings.ocr.status", "Statut de Tesseract-OCR")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {detectedPath ? (
                    <span style={{ ...S.badge, background: "#1d9e7522", color: "#1d9e75", border: "1px solid #1d9e75" }}>
                      {t("settings.ocr.detected_label", "✓ Détecté sur le système")}
                    </span>
                  ) : (
                    <span style={{ ...S.badge, background: "#e24b4a22", color: "#e24b4a", border: "1px solid #e24b4a" }}>
                      {t("settings.ocr.not_detected_label", "✗ Non détecté automatiquement")}
                    </span>
                  )}
                  <button
                    onClick={triggerAutoDetect}
                    disabled={isSearching}
                    style={{ ...S.btn, padding: "4px 10px", fontSize: 11 }}
                  >
                    {isSearching ? t("settings.ocr.searching", "Recherche...") : t("settings.ocr.redetect", "Re-détecter")}
                  </button>
                </div>
              </div>

              <div style={S.row}>
                <span style={S.label}>{t("settings.ocr.path_label", "Chemin d'accès vers tesseract.exe")}</span>
                <input
                  type="text"
                  value={tesseractPath}
                  onChange={(e) => setTesseractPath(e.target.value)}
                  placeholder={t("settings.ocr.path_placeholder", "Ex: C:\\Program Files\\Tesseract-OCR\\tesseract.exe")}
                  style={S.input}
                />
              </div>

              {!detectedPath && !tesseractPath && (
                <div style={{
                  padding: 12, background: "#e24b4a11", border: "1px solid #e24b4a44",
                  borderRadius: 6, fontSize: 12, color: "#fca5a5", lineHeight: "1.4"
                }}>
                  <strong>{t("settings.ocr.missing_title", "Tesseract-OCR est manquant :")}</strong> {t("settings.ocr.missing_desc", "Pour pouvoir extraire et analyser le texte de l'écran, vous devez installer Tesseract.")}
                  <br />
                  <a
                    href="https://github.com/UB-Mannheim/tesseract/wiki"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#E84C1E", textDecoration: "underline", display: "inline-block", marginTop: 5 }}
                  >
                    {t("settings.ocr.download_link", "Télécharger l'installateur Windows (.exe)")}
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === "python" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", maxHeight: 250, overflowY: "auto" }}>
              <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: "1.4" }}>
                {t("settings.python.desc", "Enregistrez vos environnements Python locaux (dossier contenant python.exe ou scripts).")}
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pythonEnvs.map((env, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", background: "#111113", padding: 8, borderRadius: 6, border: "0.5px solid #2a2a2e" }}>
                    <div style={{ width: 120 }}>
                      <input
                        type="text"
                        value={env.name}
                        onChange={(e) => handleUpdatePythonEnv(idx, "name", e.target.value)}
                        placeholder={t("settings.python.env_name_placeholder", "Nom (Ex: Venv311)")}
                        style={{ ...S.input, fontSize: 11, padding: "6px 8px" }}
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", gap: 4 }}>
                      <input
                        type="text"
                        value={env.dir}
                        onChange={(e) => handleUpdatePythonEnv(idx, "dir", e.target.value)}
                        placeholder={t("settings.python.env_path_placeholder", "Dossier de l'environnement")}
                        style={{ ...S.input, fontSize: 11, padding: "6px 8px" }}
                      />
                      <button
                        onClick={() => handleBrowsePythonDir(idx)}
                        style={{ ...S.btn, padding: "6px 10px" }}
                        title={t("settings.python.browse_tooltip", "Sélectionner le dossier...")}
                      >
                        📂
                      </button>
                    </div>
                    <button
                      onClick={() => handleRemovePythonEnv(idx)}
                      style={{ ...S.btn, borderColor: "#e24b4a33", color: "#e24b4a", padding: "6px 10px" }}
                      title={t("settings.generic.delete", "Supprimer")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              
              <button
                onClick={handleAddPythonEnv}
                style={{ ...S.btn, background: "#E84C1E11", borderColor: "#E84C1E", color: "#E84C1E", fontWeight: "bold", padding: "6px 12px", alignSelf: "flex-start", marginTop: 5 }}
              >
                {t("settings.python.add_btn", "+ Ajouter un environnement")}
              </button>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", maxHeight: 250, overflowY: "auto" }}>
              <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: "1.4" }}>
                {t("settings.shortcuts.desc", "Associez des raccourcis clavier globaux à des séquences d'exécution .absqc. Ces raccourcis fonctionnent en arrière-plan.")}
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shortcuts.map((sh, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", background: "#111113", padding: 8, borderRadius: 6, border: "0.5px solid #2a2a2e" }}>
                    <div style={{ width: 120 }}>
                      <input
                        type="text"
                        value={sh.combo}
                        onChange={(e) => handleUpdateShortcut(idx, "combo", e.target.value)}
                        placeholder={t("settings.shortcuts.combo_placeholder", "Ex: ctrl+alt+s")}
                        style={{ ...S.input, fontSize: 11, padding: "6px 8px" }}
                      />
                    </div>
                    <div style={{ flex: 1, display: "flex", gap: 4 }}>
                      <input
                        type="text"
                        value={sh.file_path}
                        onChange={(e) => handleUpdateShortcut(idx, "file_path", e.target.value)}
                        placeholder={t("settings.shortcuts.file_placeholder", "Fichier .absqc")}
                        style={{ ...S.input, fontSize: 11, padding: "6px 8px" }}
                      />
                      <button
                        onClick={() => handleBrowseShortcut(idx)}
                        style={{ ...S.btn, padding: "6px 10px" }}
                        title={t("settings.shortcuts.browse_tooltip", "Parcourir...")}
                      >
                        📂
                      </button>
                    </div>
                    <button
                      onClick={() => handleRemoveShortcut(idx)}
                      style={{ ...S.btn, borderColor: "#e24b4a33", color: "#e24b4a", padding: "6px 10px" }}
                      title={t("settings.generic.delete", "Supprimer")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              
              <button
                onClick={handleAddShortcut}
                style={{ ...S.btn, background: "#E84C1E11", borderColor: "#E84C1E", color: "#E84C1E", fontWeight: "bold", padding: "6px 12px", alignSelf: "flex-start", marginTop: 5 }}
              >
                {t("settings.shortcuts.add_btn", "+ Ajouter un raccourci")}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{saveStatus}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn} onClick={onClose}>{t("settings.generic.cancel", "Annuler")}</button>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={handleSave}>{t("settings.generic.save", "Enregistrer")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
