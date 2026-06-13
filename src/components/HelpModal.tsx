/**
 * HelpModal — modal d'aide déplaçable, redimensionnable, persistante.
 * Ouverte via le menu "Aides" dans MenuBar ou via le bouton "?" sur chaque nœud.
 * Réagit à l'événement global CustomEvent("open-help", { detail: { kind } }).
 */
import { useEffect, useRef, useState, useCallback } from "react";

// ── Documentation des blocs ───────────────────────────────────────────────────

interface BlockDoc {
  label: string;
  color: string;
  icon: string;
  category: string;
  description: string;
  inputs?: string[];
  outputs?: string[];
  expressions?: string[];
  notes?: string[];
}

const HELP_DOCS: Record<string, BlockDoc> = {
  start: {
    label: "Départ", color: "#22C55E", icon: "ti-player-play", category: "Spécial",
    description: "Point d'entrée de la séquence. La macro commence son exécution à partir de ce nœud. Il ne peut y en avoir qu'un seul par séquence.",
    outputs: ["→ Connexion vers le premier bloc"],
  },
  mouse_move: {
    label: "Déplacement souris", color: "#E84C1E", icon: "ti-arrows-move", category: "Souris",
    description: "Déplace le curseur de la souris vers les coordonnées X, Y spécifiées.",
    inputs: ["X — coordonnée horizontale (px)", "Y — coordonnée verticale (px)", "Écran — indice du moniteur (0 = principal)", "Relative — si vrai, déplacement relatif à la position actuelle", "Travel ms — durée du déplacement (0 = instantané)"],
    expressions: ["curpos(x) — retourne la position X actuelle de la souris", "curpos(y) — retourne la position Y actuelle"],
  },
  mouse_click: {
    label: "Clic souris", color: "#E84C1E", icon: "ti-mouse", category: "Souris",
    description: "Effectue un clic de souris à la position X, Y avec le bouton spécifié.",
    inputs: ["X / Y — coordonnées cible", "Bouton — left, right ou middle", "Double clic — effectuer un double-clic", "Travel ms — durée de déplacement", "Délai après (ms) — attente après le clic"],
  },
  mouse_scroll: {
    label: "Défilement", color: "#E84C1E", icon: "ti-arrow-autofit-height", category: "Souris",
    description: "Effectue un défilement (scroll) à la position X, Y.",
    inputs: ["X / Y — coordonnées", "ΔX — défilement horizontal", "ΔY — défilement vertical (positif = vers le bas)"],
  },
  key_press: {
    label: "Touche", color: "#378ADD", icon: "ti-keyboard", category: "Clavier",
    description: "Simule l'appui d'une combinaison de touches clavier.",
    inputs: ["Touche — ex: ctrl+c, alt+F4, Return, space", "Maintien (ms) — durée d'appui sur la touche"],
    notes: ["Utilise la syntaxe de combinaisons de touches : ctrl, alt, shift, super séparés par +"],
  },
  type_text: {
    label: "Texte", color: "#378ADD", icon: "ti-cursor-text", category: "Clavier",
    description: "Saisit du texte caractère par caractère, comme s'il était tapé au clavier.",
    inputs: ["Texte — la chaîne à saisir (supporte les expressions %var)", "ms/car — délai entre chaque caractère"],
  },
  wait: {
    label: "Attendre", color: "#7F77DD", icon: "ti-clock-pause", category: "Contrôle",
    description: "Met la séquence en pause pendant la durée spécifiée ou jusqu'à une heure fixe.",
    inputs: [
      "Mode d'attente — Durée (ms) ou Heures/Minutes spécifiées (Format: HH:MM:SS ou DD/MM/YYYY HH:MM:SS)",
      "Durée (ms) — temps d'attente en millisecondes (ex: 2000)",
      "Cible Date & Heure — Date et/ou heure de réveil de la pause"
    ],
  },
  iterations: {
    label: "Itérations", color: "#7F77DD", icon: "ti-repeat", category: "Contrôle",
    description: "Répète les instructions enfants un nombre défini de fois, ou indéfiniment en mode infini.",
    inputs: ["Nombre d'itérations — nombre entier de répétitions", "Mode Infini — boucle perpétuelle"],
    outputs: ["▶ Corps — chemin vers les blocs de boucle"],
  },
  foreach: {
    label: "ForEach", color: "#7F77DD", icon: "ti-rotate-clockwise", category: "Contrôle",
    description: "Parcourt les éléments d'un tableau ou d'un dictionnaire.",
    inputs: ["Nom de la collection — variable contenant le tableau/dictionnaire"],
    outputs: ["▶ Corps — blocs exécutés à chaque élément"],
    notes: ["Met à disposition les variables contextuelles %x (valeur), %foreachindex, %key et %value"],
  },
  for_loop: {
    label: "Boucle FOR", color: "#7F77DD", icon: "ti-arrows-right-left", category: "Contrôle",
    description: "Répète un bloc d'instructions un nombre de fois défini par une plage de valeurs.",
    inputs: ["Variable de boucle — nom de la variable compteur", "De — valeur de départ", "À — valeur finale ou ∞", "Pas — incrément", "Mode Infini — boucle perpétuelle sans valeur finale"],
    outputs: ["▶ Corps — blocs à répéter à l'intérieur de la boucle", "↩ Retour — fin d'une itération (reboucle)", "⏏ Break — sortie anticipée de la boucle", "→ Suite — bloc suivant après la boucle"],
    expressions: ["La variable de boucle (ex: %i) est accessible dans les blocs enfants"],
  },
  if: {
    label: "Si (If)", color: "#EF9F27", icon: "ti-git-branch", category: "Logique",
    description: "Évalue une condition et dirige le flux vers la branche Vrai ou Faux.",
    inputs: ["Condition — expression booléenne (ex: %score > 10)"],
    outputs: ["✓ Vrai — chemin emprunté si la condition est vraie", "✗ Faux — chemin emprunté si la condition est fausse"],
    notes: ["Opérateurs supportés : ==, !=, <, <=, >, >=, &&, ||", "Exemple : %myVar == 'hello' && %score > 5"],
  },
  math: {
    label: "Math", color: "#7F77DD", icon: "ti-calculator", category: "Contrôle",
    description: "Évalue une expression mathématique et stocke le résultat dans une variable.",
    inputs: ["Variable cible — nom de la variable de résultat", "Expression — calcul à effectuer (ex: %a * 2 + 1)"],
    expressions: ["Opérateurs : +, -, *, /, %, ** (puissance)", "Fonctions : abs(), floor(), ceil(), round(), sqrt(), sin(), cos(), log()"],
  },
  set_variable: {
    label: "Variable (locale)", color: "#7F77DD", icon: "ti-variable", category: "Contrôle",
    description: "Définit une ou plusieurs variables locales dans le contexte d'exécution courant.",
    inputs: ["Nom — identifiant de la variable", "Valeur — valeur ou expression (ex: %autreVar + 1)"],
    expressions: ["Les variables sont accessibles via %nomVar dans les autres blocs"],
    notes: ["Vous pouvez définir plusieurs variables dans un seul nœud en cliquant sur '+ Ajouter une variable'"],
  },
  random: {
    label: "Aléatoire", color: "#D4537E", icon: "ti-dice", category: "Contrôle",
    description: "Génère une valeur aléatoire selon le mode choisi et la stocke dans une variable.",
    inputs: ["Mode — Entier, Décimal, Booléen, Texte ou Liste", "Min / Max — plage de valeurs", "Seed fixe — pour des résultats reproductibles", "Var. de sortie — variable qui reçoit la valeur"],
  },
  pixel_color: {
    label: "Couleur pixel", color: "#1D9E75", icon: "ti-color-picker", category: "Vision",
    description: "Lit la couleur d'un pixel à l'écran et compare avec une couleur attendue.",
    inputs: ["X / Y — coordonnées du pixel", "Format — HEX, RGB ou HSV", "Couleur attendue — valeur de référence", "Tolérance — marge d'erreur (0–255)", "Itérations — nombre de tentatives", "Cool-down (ms) — délai entre tentatives", "Var. sortie — variable recevant la couleur lue"],
    outputs: ["✓ Trouvé — si la couleur correspond", "✗ Non trouvé — si la couleur ne correspond pas"],
    expressions: ["La variable de sortie contient la couleur au format sélectionné"],
  },
  image_match: {
    label: "Comparateur image", color: "#1D9E75", icon: "ti-photo-search", category: "Vision",
    description: "Recherche une image template dans une zone définie de l'écran.",
    inputs: ["Template — image de référence (capture ou fichier)", "Zone (X, Y, L, H) — région de l'écran à scanner", "Seuil — niveau de similarité requis (0.0–1.0)", "Itérations — nombre de tentatives", "Cool-down (ms) — délai entre tentatives", "Mode — Premier Match ou Tous Match", "Var. sortie — reçoit un dict BOX des coordonnées"],
    outputs: ["✓ Trouvé — si l'image est détectée", "✗ Non trouvé — si l'image est absente"],
    notes: ["Seuil recommandé : 0.85 à 0.95", "Premier Match → {\"X\", \"Y\", \"L\", \"H\"}", "Tous Match → {\"Match_0\":{...}, \"Match_1\":{...}, ...}"],
  },
  ocr: {
    label: "OCR", color: "#1D9E75", icon: "ti-scan", category: "Vision",
    description: "Reconnaît le texte dans une zone de l'écran. Peut chercher un texte spécifique et supporter plusieurs modes de correspondance.",
    inputs: ["Zone OCR — région de l'écran à analyser (X, Y, L, H)", "Langue — code langue Tesseract (fra, eng, deu...)", "Itérations — nombre de tentatives", "Cool-down (ms) — délai entre tentatives", "MATCH — texte à chercher (vide = capturer tout le texte)", "Aa — Match case (sensible à la casse)", "\\b — Match whole word (mot entier uniquement)", ".* — Use Regular Expression (syntaxe regex)", "Tolérance — taux d'erreur acceptable (%) en mode non-regex", "Var. sortie — texte reconnu (ou texte trouvé)"],
    outputs: ["✓ Trouvé — si le texte MATCH est détecté (ou texte capturé non vide)", "✗ Non trouvé — si le texte est absent ou ne correspond pas"],
    expressions: ["La variable de sortie contient le texte reconnu", "count(%ocrText) — retourne la longueur du texte"],
  },
  function_call: {
    label: "Appel Fonction", color: "#A855F7", icon: "ti-function", category: "Fonction",
    description: "Appelle une fonction définie dans un onglet Fonction et récupère sa valeur de retour.",
    inputs: ["Nom de la fonction — identifiant de la fonction à appeler", "Arguments — valeurs passées à la fonction", "Var. de retour — variable qui reçoit la valeur retournée"],
    expressions: ["Les arguments sont évalués comme expressions avant d'être passés"],
  },
  array_push: {
    label: "Push Array", color: "#0EA5E9", icon: "ti-list-details", category: "Array",
    description: "Ajoute une ou plusieurs valeurs à un tableau (array).",
    inputs: ["Array — nom de la variable tableau", "Valeurs — valeurs séparées par virgule", "Position — au début (front) ou à la fin (back)", "Unique — éviter les doublons"],
    expressions: ["count(%monArray) — retourne le nombre d'éléments"],
  },
  array_merge: {
    label: "Merge Arrays", color: "#0EA5E9", icon: "ti-arrows-join", category: "Array",
    description: "Fusionne plusieurs tableaux en un seul nouveau tableau.",
    inputs: ["Arrays — noms de variables séparés par virgule", "Var. sortie — tableau résultant de la fusion"],
  },
  array_get: {
    label: "Get Index", color: "#8B5CF6", icon: "ti-list-search", category: "Collection",
    description: "Récupère la valeur à un index précis dans un tableau.",
    inputs: ["Array — variable tableau", "Index — position (commence à 0)", "Var. sortie — valeur extraite"],
  },
  array_search: {
    label: "Chercher (Array)", color: "#0EA5E9", icon: "ti-search", category: "Array",
    description: "Recherche une ou plusieurs valeurs dans un tableau et retourne leur(s) index.",
    inputs: ["Array — variable tableau", "Valeurs — valeurs à chercher", "Mode — premier trouvé (INT), dernier trouvé (INT), ou tous (ARRAY)"],
  },
  array_delete: {
    label: "Suppr. Index", color: "#8B5CF6", icon: "ti-trash-x", category: "Collection",
    description: "Supprime l'élément à l'index spécifié d'un tableau.",
    inputs: ["Array — variable tableau", "Index — position à supprimer"],
  },
  dict_add: {
    label: "Add Dict", color: "#F59E0B", icon: "ti-table-plus", category: "Dict",
    description: "Ajoute ou met à jour des paires clé-valeur dans un dictionnaire.",
    inputs: ["Dict — variable dictionnaire", "Paires — une ou plusieurs clé/valeur"],
    expressions: ["count(%monDict) — retourne le nombre de clés"],
  },
  dict_combine: {
    label: "Combine Dicts", color: "#F59E0B", icon: "ti-layers-union", category: "Dict",
    description: "Combine plusieurs dictionnaires en un seul. En cas de clé dupliquée, la valeur du dernier dict est conservée.",
    inputs: ["Dicts — noms de variables séparés par virgule", "Var. sortie — dictionnaire résultat"],
  },
  dict_find: {
    label: "Find Key", color: "#8B5CF6", icon: "ti-key", category: "Collection",
    description: "Recherche la valeur associée à une clé dans un dictionnaire.",
    inputs: ["Dict — variable dictionnaire", "Clé — la clé à rechercher", "Var. sortie — valeur trouvée"],
  },
  dict_remove: {
    label: "Remove Key", color: "#F59E0B", icon: "ti-table-minus", category: "Dict",
    description: "Supprime une entrée d'un dictionnaire par sa clé.",
    inputs: ["Dict — variable dictionnaire", "Clé — la clé à supprimer"],
  },
  switch: {
    label: "Switch", color: "#EF9F27", icon: "ti-git-commit", category: "Logique",
    description: "Compare une expression avec plusieurs cas. Dirige le flux vers le port correspondant au premier cas valide, ou 'défaut' sinon.",
    inputs: ["Expression — la valeur ou variable à tester (ex: %maVar)"],
    outputs: ["Cas X — port correspondant au cas X", "défaut — port emprunté si aucun cas ne correspond"],
  },
  python: {
    label: "Python", color: "#3776AB", icon: "ti-brand-python", category: "Système",
    description: "Exécute un script Python natif via l'interpréteur système ou avec le gestionnaire rapide 'uv'.",
    inputs: ["Script — code Python à exécuter", "Requirements — librairies à installer (mode uv)", "Version Python — ex: 3.12", "Var. de sortie — reçoit le résultat (stdout ou variable)"],
    notes: ["Le mode uv télécharge automatiquement les dépendances de façon isolée et rapide."],
  },
  console: {
    label: "Console", color: "#64748B", icon: "ti-terminal", category: "Système",
    description: "Affiche un message de log formaté dans la console unifiée de l'application.",
    inputs: ["Texte — message à logger (supporte les variables comme %maVar)"],
  },
  ia: {
    label: "IA Inférence", color: "#3B82F6", icon: "ti-brain", category: "Système",
    description: "Exécute une requête d'intelligence artificielle en texte (LLM) ou vision (VLM) locale ou distante.",
    inputs: ["Mode — Texte ou Image/Vision", "Prompt — instructions et contexte", "Source — API externe ou Ollama local", "Modèle — ex: gpt-4o", "Var. de sortie — reçoit le texte généré"],
  },
  vpo: {
    label: "VPO (YOLO)", color: "#10B981", icon: "ti-eye", category: "Système",
    description: "Détecte des objets en temps réel à l'écran via un modèle de vision YOLO.",
    inputs: ["Classe — objet à chercher (person, car, ...)", "Seuil — confiance minimale (0.1–1.0)", "Var. de sortie — reçoit la boîte de détection (X, Y, L, H)"],
  },
  function_args: {
    label: "Arguments", color: "#22C55E", icon: "ti-input-check", category: "Spécial",
    description: "Définit les arguments reçus en entrée par une fonction.",
    inputs: ["Arguments — liste des variables d'entrée"],
  },
  function_return: {
    label: "Retour", color: "#EF9F27", icon: "ti-corner-up-left", category: "Spécial",
    description: "Définit la valeur retournée à la fin de l'exécution d'une fonction.",
    inputs: ["Valeur — expression ou variable renvoyée (ex: %resultat)"],
  },
  cmd: {
    label: "CMD", color: "#64748B", icon: "ti-terminal-2", category: "Système",
    description: "Exécute une commande système (Python, Perl, Ruby, Node.js, Bash, PowerShell…).",
    inputs: ["Commande — ligne à exécuter avec %variables", "Attendre — oui (sync) ou non (async)", "Var. retour — %CMDReturn reçoit stdout (si Attendre=Oui)"],
    notes: ["Bouton historique console sur le nœud et dans l'inspecteur", "En mode async, %CMDReturn n'est pas alimentée"],
  },
};

// Expressions globales
const GLOBAL_EXPRESSIONS: BlockDoc = {
  label: "Expressions & Fonctions", color: "#888", icon: "ti-code", category: "Général",
  description: "Les expressions peuvent être utilisées dans la plupart des champs de valeur. Elles sont évaluées au moment de l'exécution.",
  inputs: [
    "%maVariable — valeur d'une variable (préfixe %)",
    "curpos(x) — position X actuelle de la souris",
    "curpos(y) — position Y actuelle de la souris",
    "curpos(x, 1) — position X sur l'écran n°1",
    "count(%var) — nombre d'éléments (array), clés (dict) ou caractères (string)",
    "random(min, max) — nombre aléatoire entre min et max",
    "round(%val, 2) — arrondi à 2 décimales",
    "abs(%val) — valeur absolue",
    "floor(%val), ceil(%val) — arrondi inférieur/supérieur",
    "sqrt(%val) — racine carrée",
    "sin(%val), cos(%val), log(%val) — fonctions trigonométriques/log",
  ],
  notes: [
    "Les expressions sont imbriquables : count(curpos(x))",
    "Les opérateurs arithmétiques (+, -, *, /, %, **) sont supportés",
    "Les chaînes peuvent être concaténées avec + : 'Bonjour ' + %nom",
  ],
};

const CATEGORIES = ["Spécial", "Souris", "Clavier", "Contrôle", "Logique", "Vision", "Array", "Dict", "Système", "Fonction", "Général"];

// ── Composant principal ───────────────────────────────────────────────────────

interface HelpModalProps {
  open: boolean;
  initialKind?: string;
  onClose: () => void;
}

export function HelpModal({ open, initialKind, onClose }: HelpModalProps) {
  const [selectedKind, setSelectedKind] = useState<string>(initialKind ?? "start");
  const [pos, setPos] = useState({ x: 80, y: 60 });
  const [size, setSize] = useState({ w: 780, h: 520 });
  const dragRef = useRef<{ startX:number; startY:number; origX:number; origY:number } | null>(null);
  const resizeRef = useRef<{ startX:number; startY:number; origW:number; origH:number } | null>(null);

  useEffect(() => {
    if (initialKind) setSelectedKind(initialKind);
  }, [initialKind]);

  // Drag header
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, dragRef.current.origX + ev.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.origY + ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Resize corner
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(520, resizeRef.current.origW + ev.clientX - resizeRef.current.startX),
        h: Math.max(360, resizeRef.current.origH + ev.clientY - resizeRef.current.startY),
      });
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const doc = selectedKind === "_expressions"
    ? GLOBAL_EXPRESSIONS
    : (HELP_DOCS[selectedKind] ?? null);

  const byCategory = CATEGORIES.map(cat => ({
    cat,
    items: Object.entries(HELP_DOCS).filter(([, d]) => d.category === cat),
  })).filter(g => g.items.length > 0);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y,
      width: size.w, height: size.h,
      background: "#13131a", border: "0.5px solid #2a2a2e",
      borderRadius: 10, boxShadow: "0 20px 60px #000d",
      zIndex: 10000, display: "flex", flexDirection: "column",
      fontFamily: "monospace", overflow: "hidden",
      userSelect: "none",
    }}>
      {/* Header drag */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", background: "#0f0f15",
          borderBottom: "0.5px solid #2a2a2e", cursor: "grab", flexShrink: 0,
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: 4, background: "#E84C1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-help" style={{ fontSize: 10, color: "#fff" }} />
        </div>
        <span style={{ fontSize: 12, color: "#d0d0d0", fontWeight: 600, flex: 1 }}>Documentation — Auto Bot</span>
        <button
          onClick={onClose}
          style={{
            width: 20, height: 20, borderRadius: 4, background: "transparent",
            border: "0.5px solid #2a2a2e", cursor: "pointer",
            color: "#666", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#E24B4A22"; e.currentTarget.style.color = "#E24B4A"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#666"; }}
        >✕</button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{
          width: 200, flexShrink: 0, background: "#0e0e14",
          borderRight: "0.5px solid #1a1a24", overflowY: "auto",
          padding: "8px 0",
        }}>
          {/* Expressions globales */}
          <button
            onClick={() => setSelectedKind("_expressions")}
            style={{
              width: "100%", textAlign: "left", padding: "6px 14px",
              background: selectedKind === "_expressions" ? "#E84C1E15" : "transparent",
              border: "none", borderLeft: `2px solid ${selectedKind === "_expressions" ? "#E84C1E" : "transparent"}`,
              color: selectedKind === "_expressions" ? "#E84C1E" : "#888",
              fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <i className="ti ti-code" style={{ fontSize: 11 }} />
            Expressions
          </button>
          <div style={{ height: "0.5px", background: "#1a1a24", margin: "5px 10px" }} />

          {byCategory.map(({ cat, items }) => (
            <div key={cat}>
              <p style={{ fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2a2a3a", padding: "6px 14px 2px" }}>{cat}</p>
              {items.map(([kind, d]) => (
                <button
                  key={kind}
                  onClick={() => setSelectedKind(kind)}
                  style={{
                    width: "100%", textAlign: "left", padding: "5px 14px",
                    background: selectedKind === kind ? `${d.color}15` : "transparent",
                    border: "none", borderLeft: `2px solid ${selectedKind === kind ? d.color : "transparent"}`,
                    color: selectedKind === kind ? d.color : "#666",
                    fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={e => { if (selectedKind !== kind) e.currentTarget.style.color = "#aaa"; }}
                  onMouseLeave={e => { if (selectedKind !== kind) e.currentTarget.style.color = "#666"; }}
                >
                  <i className={`ti ${d.icon}`} style={{ fontSize: 10, color: selectedKind === kind ? d.color : "#333" }} />
                  {d.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", userSelect: "text" }}>
          {doc ? (
            <>
              {/* Title */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: doc.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${doc.icon}`} style={{ fontSize: 14, color: "#fff" }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>{doc.label}</h2>
                  <span style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em" }}>{doc.category}</span>
                </div>
              </div>

              {/* Description */}
              <p style={{ fontSize: 11, color: "#888", lineHeight: 1.7, marginBottom: 20, borderLeft: `2px solid ${doc.color}66`, paddingLeft: 10 }}>
                {doc.description}
              </p>

              {/* Inputs */}
              {doc.inputs && doc.inputs.length > 0 && (
                <Section title="Paramètres / Entrées" color="#378ADD">
                  {doc.inputs.map((inp, i) => <DocItem key={i} text={inp} color="#378ADD" />)}
                </Section>
              )}

              {/* Outputs */}
              {doc.outputs && doc.outputs.length > 0 && (
                <Section title="Sorties / Connexions" color="#1D9E75">
                  {doc.outputs.map((out, i) => <DocItem key={i} text={out} color="#1D9E75" />)}
                </Section>
              )}

              {/* Expressions */}
              {doc.expressions && doc.expressions.length > 0 && (
                <Section title="Expressions disponibles" color="#A855F7">
                  {doc.expressions.map((ex, i) => <DocItem key={i} text={ex} color="#A855F7" mono />)}
                </Section>
              )}

              {/* Notes */}
              {doc.notes && doc.notes.length > 0 && (
                <Section title="Notes" color="#EF9F27">
                  {doc.notes.map((n, i) => <DocItem key={i} text={n} color="#EF9F27" />)}
                </Section>
              )}
            </>
          ) : (
            <p style={{ color: "#444", fontSize: 11 }}>Sélectionne un bloc dans le panneau gauche.</p>
          )}
        </div>
      </div>

      {/* Resize corner */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: 16, height: 16, cursor: "nwse-resize",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <i className="ti ti-arrow-autofit-down-right" style={{ fontSize: 10, color: "#333" }} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function DocItem({ text, color, mono }: { text: string; color: string; mono?: boolean }) {
  const [dash, ...rest] = text.split(" — ");
  const desc = rest.join(" — ");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 8px", background: "#0d0d14", borderRadius: 5, border: `0.5px solid ${color}22` }}>
      <span style={{ fontSize: 10, color, fontFamily: "monospace", fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{dash}</span>
      {desc && <span style={{ fontSize: 10, color: "#666", fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.5 }}>{desc}</span>}
    </div>
  );
}

// ── Hook d'état global de la modal ────────────────────────────────────────────

let _setOpen: ((v: boolean) => void) | null = null;
let _setKind: ((k: string) => void) | null = null;

export function useHelpModal() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("start");

  const registerRef = useCallback(() => {
    _setOpen = setOpen;
    _setKind = setKind;
  }, [setOpen, setKind]);

  return { open, kind, setOpen, setKind, registerRef };
}

export function openHelpFor(kind: string) {
  _setKind?.(kind);
  _setOpen?.(true);
}
