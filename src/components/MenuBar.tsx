/**
 * MenuBar — barre de menus déroulants Fichier / Édition / Options
 * Fonctionne avec onMouseDown pour éviter les conflits avec le ReactFlow focus.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editorStore";

// ── Types internes ────────────────────────────────────────────────────────────

type MenuId = "fichier" | "edition" | "options" | "aides" | null;

interface MenuItemDef {
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  separator?: never;
}
interface SeparatorDef { separator: true; label?: never; icon?: never; shortcut?: never; action?: never; disabled?: never; }
type ItemDef = MenuItemDef | SeparatorDef;

// ── Composant item ────────────────────────────────────────────────────────────

function DropItem({ item, onClose }: { item: ItemDef; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  if ("separator" in item && item.separator) {
    return <div style={{ height: "0.5px", background: "#2a2a2e", margin: "3px 10px" }} />;
  }
  const it = item as MenuItemDef;
  return (
    <button
      onMouseDown={e => {
        e.preventDefault();
        if (!it.disabled) { it.action(); onClose(); }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!!it.disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "7px 14px",
        background: hover && !it.disabled ? "#222228" : "transparent",
        border: "none", cursor: it.disabled ? "default" : "pointer",
        color: it.disabled ? "#444" : "#bbb",
        fontSize: 11, fontFamily: "monospace", textAlign: "left",
        transition: "background 0.1s",
        justifyContent: "space-between",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {it.icon && <i className={`ti ${it.icon}`} style={{ fontSize: 12, color: it.disabled ? "#333" : "#888", width: 14 }} />}
        {!it.icon && <span style={{ width: 14 }} />}
        {it.label}
      </span>
      {it.shortcut && (
        <span style={{ color: "#444", fontSize: 10, marginLeft: 16 }}>{it.shortcut}</span>
      )}
    </button>
  );
}

// ── Composant menu déroulant ──────────────────────────────────────────────────

function DropMenu({
  id, label, open, items, onToggle, onClose,
}: {
  id: MenuId; label: string; open: boolean;
  items: ItemDef[];
  onToggle: (id: MenuId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onMouseDown={e => { e.preventDefault(); onToggle(id); }}
        style={{
          padding: "0 10px", height: 28,
          background: open ? "#1a1a20" : "transparent",
          border: "none", cursor: "pointer",
          color: open ? "#e0e0e0" : "#888",
          fontSize: 11, fontFamily: "monospace",
          borderRadius: 4,
          transition: "background 0.1s, color 0.1s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = "#16161a"; e.currentTarget.style.color = "#ccc"; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#888"; } }}
      >
        {label}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 9999,
          background: "#18181b", border: "0.5px solid #2a2a2e",
          borderRadius: 8, boxShadow: "0 10px 40px #000e",
          overflow: "hidden", minWidth: 220,
          padding: "3px 0",
        }}>
          {items.map((item, i) => (
            <DropItem key={i} item={item} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MenuBar principal ─────────────────────────────────────────────────────────

export function MenuBar({ onOpenHelp, onOpenSettings }: { onOpenHelp?: () => void; onOpenSettings?: () => void }) {
  const {
    tabs, activeTabId,
    addMainTab, addFunctionTab,
    saveActiveTab, openAny,
    runSequence, stopSequence,
    convertActiveTab,
    status,
  } = useEditorStore();

  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem("autobot_ui_zoom");
    return saved ? Number(saved) : 100;
  });

  useEffect(() => {
    invoke("set_webview_zoom", { factor: zoom / 100 }).catch(err => console.error("Webview zoom error:", err));
  }, [zoom]);

  const handleZoom = (delta: number) => {
    setZoom(z => {
      const next = Math.min(150, Math.max(70, z + delta));
      localStorage.setItem("autobot_ui_zoom", String(next));
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(100);
    localStorage.setItem("autobot_ui_zoom", "100");
  };

  const activeTab  = tabs.find(t => t.id === activeTabId);
  const isMain     = activeTab?.kind === "main";
  const isRunning  = status === "running";

  useEffect(() => {
    const handleCustomZoom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "number") {
        setZoom(detail);
      }
    };
    window.addEventListener("autobot-zoom-changed", handleCustomZoom);
    return () => window.removeEventListener("autobot-zoom-changed", handleCustomZoom);
  }, []);

  // Fermer sur clic extérieur
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [openMenu]);

  const toggle = useCallback((id: MenuId) => {
    setOpenMenu(prev => prev === id ? null : id);
  }, []);

  const close = useCallback(() => setOpenMenu(null), []);

  // ── Définitions des menus ─────────────────────────────────────────────────

  const menuFichier: ItemDef[] = [
    {
      label: "Nouvelle séquence",
      icon: "ti-layout-board",
      shortcut: "",
      action: addMainTab,
    },
    {
      label: "Nouvelle fonction",
      icon: "ti-function",
      action: () => {
        addFunctionTab("fonction_temp");
      },
    },
    { separator: true },
    {
      label: "Ouvrir…",
      icon: "ti-folder-open",
      action: openAny,
    },
    { separator: true },
    {
      label: "Sauvegarder",
      icon: "ti-device-floppy",
      shortcut: "Ctrl+S",
      action: saveActiveTab,
    },
  ];

  const menuEdition: ItemDef[] = [
    {
      label: isMain
        ? "Convertir en fonction"
        : "Convertir en séquence",
      icon: isMain ? "ti-arrows-exchange" : "ti-arrows-exchange",
      action: () => {
        const msg = isMain
          ? "Convertir cette séquence en fonction ?\n\nLe nœud Départ sera remplacé par Arguments et un nœud Retour sera ajouté."
          : "Convertir cette fonction en séquence ?\n\nLe nœud Arguments sera remplacé par Départ et le nœud Retour sera supprimé.";
        if (window.confirm(msg)) convertActiveTab();
      },
    },
    { separator: true },
    {
      label: isRunning ? "Arrêter l'exécution" : "Exécuter la séquence",
      icon: isRunning ? "ti-player-stop" : "ti-player-play",
      shortcut: "F6",
      disabled: !isMain && !isRunning,
      action: () => isRunning ? stopSequence() : runSequence(),
    },
  ];

  const menuOptions: ItemDef[] = [
    {
      label: "Paramètres",
      icon: "ti-settings",
      action: () => onOpenSettings?.(),
    },
    { separator: true },
    {
      label: "Vider le journal",
      icon: "ti-trash",
      action: () => useEditorStore.getState().clearLog(),
    },
    { separator: true },
    {
      label: "À propos",
      icon: "ti-info-circle",
      action: () => window.alert("Auto Bot v0.1\nÉditeur de macros visuelles\nRust · Tauri 2 · React"),
    },
  ];

  const menuAides: ItemDef[] = [
    {
      label: "Documentation des blocs",
      icon: "ti-book",
      action: () => onOpenHelp?.(),
    },
    { separator: true },
    {
      label: "Raccourcis clavier",
      icon: "ti-keyboard",
      action: () => onOpenHelp?.(),
    },
  ];

  const menus: { id: MenuId; label: string; items: ItemDef[] }[] = [
    { id: "fichier",  label: "Fichier",  items: menuFichier },
    { id: "edition",  label: "Édition",  items: menuEdition },
    { id: "options",  label: "Options",  items: menuOptions },
    { id: "aides",    label: "Aides",    items: menuAides },
  ];

  return (
    <div
      ref={barRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        height: 30,
        background: "#0c0c0f",
        borderBottom: "0.5px solid #1a1a1e",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {/* Logo micro */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          paddingRight: 10, marginRight: 4,
          borderRight: "0.5px solid #1a1a1e",
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: 4, background: "#E84C1E",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className="ti ti-robot" style={{ fontSize: 9, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#555", letterSpacing: "0.04em" }}>
            Auto Bot
          </span>
        </div>

        {menus.map(m => (
          <DropMenu
            key={m.id}
            id={m.id}
            label={m.label}
            open={openMenu === m.id}
            items={m.items}
            onToggle={toggle}
            onClose={close}
          />
        ))}
      </div>

      {/* Interface Zoom Control buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#555", marginRight: 5 }}>
          Zoom: {zoom}%
        </span>
        <button
          onClick={() => handleZoom(-10)}
          title="Réduire l'interface"
          style={{
            background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: 4,
            color: "#bbb", width: 20, height: 20, cursor: "pointer", fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          -
        </button>
        <button
          onClick={handleResetZoom}
          title="Réinitialiser le zoom"
          style={{
            background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: 4,
            color: "#bbb", padding: "0 5px", height: 20, cursor: "pointer", fontSize: 10,
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace"
          }}
        >
          Reset
        </button>
        <button
          onClick={() => handleZoom(10)}
          title="Agrandir l'interface"
          style={{
            background: "#18181b", border: "0.5px solid #2a2a2e", borderRadius: 4,
            color: "#bbb", width: 20, height: 20, cursor: "pointer", fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
