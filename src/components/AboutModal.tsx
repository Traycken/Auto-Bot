
import { t } from "../store/editorStore";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(6, 6, 8, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#f3f4f6",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          background: "linear-gradient(135deg, #16161a 0%, #0c0c0f 100%)",
          border: "0.5px solid #2a2a32",
          borderRadius: 12,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(232, 76, 30, 0.15)",
          overflow: "hidden",
          position: "relative",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Style tag for animations */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}} />

        {/* Decorative Top Accent line */}
        <div style={{ height: 3, background: "linear-gradient(90deg, #E84C1E 0%, #f97316 100%)" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "0.5px solid #2a2a32" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #E84C1E 0%, #f97316 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-info-circle" style={{ fontSize: 13, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>{t("about.title", "À propos")}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#f3f4f6";
              e.currentTarget.style.background = "#222228";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#6b7280";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Logo / Brand Name */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px 0", color: "#fff", letterSpacing: "-0.02em" }}>
              Auto-Bot
            </h2>
            <span style={{ fontSize: 11, color: "#E84C1E", background: "rgba(232, 76, 30, 0.1)", padding: "2px 8px", borderRadius: 12, fontWeight: 600, border: "0.5px solid rgba(232, 76, 30, 0.2)" }}>
              {t("about.version", "Version 0.1.0")}
            </span>
          </div>

          <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, textAlign: "center", margin: "0 0 20px 0" }}>
            {t("about.desc", "Éditeur de flux d'automatisation de bureau moderne et performant pour l'automatisation intelligente de vos tâches répétitives.")}
          </p>

          {/* Technical Specs List */}
          <div style={{ background: "#0a0a0d", borderRadius: 8, border: "0.5px solid #2a2a32", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <i className="ti ti-cpu" style={{ color: "#E84C1E", fontSize: 14, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb" }}>{t("about.engine", "Moteur")}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{t("about.engine_desc", "Rust & Tauri 2.0 (Sécurisé, léger et ultra-rapide)")}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <i className="ti ti-layout" style={{ color: "#E84C1E", fontSize: 14, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb" }}>{t("about.interface", "Interface")}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{t("about.interface_desc", "React, TypeScript & React Flow")}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <i className="ti ti-box" style={{ color: "#E84C1E", fontSize: 14, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb" }}>{t("about.features", "Fonctionnalités")}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>
                  {t("about.features_desc", "OCR Tesseract, Vision YOLO (ONNX), Inférence IA, Clavier/Souris, Tableaux & Dictionnaires, Raccourcis globaux, Console déportée.")}
                </div>
              </div>
            </div>
          </div>

          {/* Footer credits */}
          <div style={{ textAlign: "center", fontSize: 10, color: "#4b5563" }}>
            {t("about.credits_title", "Développé pour l'automatisation intelligente.")}<br />
            {t("about.copyright", "© 2026 Auto-Bot Team. Tous droits réservés.")}
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px", borderTop: "0.5px solid #2a2a32", background: "#0a0a0d" }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              background: "#16161a",
              border: "0.5px solid #2a2a32",
              borderRadius: 6,
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#444";
              e.currentTarget.style.background = "#222228";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#2a2a32";
              e.currentTarget.style.background = "#16161a";
            }}
          >
            {t("tab.close", "Fermer")}
          </button>
        </div>
      </div>
    </div>
  );
}
