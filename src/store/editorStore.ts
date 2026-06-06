import { create } from "zustand";
import {
  applyNodeChanges, applyEdgeChanges, addEdge,
  type NodeChange, type EdgeChange, type Connection, type Node, type Edge,
} from "@xyflow/react";
import { Block, BlockKind, BLOCK_CATALOG } from "../types/blocks";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Node / Edge types ─────────────────────────────────────────────────────────

export type MacroNodeData = Block & {
  label: string; color: string; icon: string;
  [key: string]: unknown;
};
export type MacroNode = Node<MacroNodeData, string>;
export type MacroEdge = Edge;

// ── Tab ───────────────────────────────────────────────────────────────────────

export type TabKind = "main" | "function";

export interface Tab {
  id: string;
  kind: TabKind;
  name: string;
  nodes: MacroNode[];
  edges: MacroEdge[];
  filePath?: string;
  dirty: boolean;
}

// ── Variables ─────────────────────────────────────────────────────────────────

export interface VarEntry { name: string; value: string; description: string; }

// ── Engine ────────────────────────────────────────────────────────────────────

export type EngineStatus = "idle" | "running" | "stopped" | "error";
export interface LogEntry { ts: number; level: "info" | "ok" | "error" | "run"; message: string; }

export interface CmdLogEntry {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timestamp: string;
  async?: boolean;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface EditorStore {
  tabs: Tab[];
  activeTabId: string;
  nodes: MacroNode[];
  edges: MacroEdge[];

  addMainTab: () => void;
  addFunctionTab: (name?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  /** Convert active tab: main→function or function→main */
  convertActiveTab: () => void;

  selectedNodeId: string | null;
  onNodesChange: (changes: NodeChange<MacroNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: BlockKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;

  status: EngineStatus;
  log: LogEntry[];
  cmdHistory: Record<string, CmdLogEntry[]>;
  variables: VarEntry[];
  setVariable: (name: string, value: string, description?: string) => void;
  removeVariable: (name: string) => void;
  runSequence: () => Promise<void>;
  stopSequence: () => Promise<void>;
  pushLog: (entry: Omit<LogEntry, "ts">) => void;
  clearLog: () => void;
  pushCmdLog: (nodeId: string, entry: CmdLogEntry) => void;
  initEngineListeners: () => () => void;

  saveActiveTab: () => Promise<void>;
  openSequence: () => Promise<void>;
  openFunction: () => Promise<void>;
  openSequenceWithPath: (path: string) => Promise<void>;
  openFunctionWithPath: (path: string) => Promise<void>;
  openAny: () => Promise<void>;
  saveFunction: (tabId: string) => Promise<void>;

  clipboard: MacroNode[];
  copyNodes: (ids: string[]) => void;
  pasteNodes: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = 0;
const uid = () => `n${++_counter}_${Date.now().toString(36)}`;
const tabUid = () => `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

export function nodeTypeForKind(kind: BlockKind): string {
  if (kind === "start")           return "startNode";
  if (kind === "function_args")   return "functionArgsNode";
  if (kind === "function_return") return "functionReturnNode";
  if (kind === "for_loop")        return "forNode";
  if (kind === "if")              return "ifNode";
  if (kind === "math")            return "mathNode";
  if (kind === "random")          return "randomNode";
  if (kind === "function_call")   return "functionCallNode";
  return "macroBlock";
}

function makeStartNode(position = { x: 80, y: 80 }): MacroNode {
  const meta = BLOCK_CATALOG.find(m => m.kind === "start")!;
  return {
    id: uid(), type: "startNode", position,
    data: { kind: "start", label: meta.label, color: meta.color, icon: meta.icon } as MacroNodeData,
    deletable: false,
  };
}

function makeFunctionArgsNode(position = { x: 80, y: 80 }): MacroNode {
  const meta = BLOCK_CATALOG.find(m => m.kind === "function_args")!;
  return {
    id: uid(), type: "functionArgsNode", position,
    data: { kind: "function_args", label: meta.label, color: meta.color, icon: meta.icon, args: [] } as MacroNodeData,
    deletable: false,
  };
}

function makeFunctionReturnNode(position = { x: 80, y: 300 }): MacroNode {
  const meta = BLOCK_CATALOG.find(m => m.kind === "function_return")!;
  return {
    id: uid(), type: "functionReturnNode", position,
    data: { kind: "function_return", label: meta.label, color: meta.color, icon: meta.icon, value: "" } as MacroNodeData,
    deletable: false,
  };
}

function makeInitialMainTab(): Tab {
  return {
    id: tabUid(), kind: "main", name: "Séquence 1",
    nodes: [makeStartNode()], edges: [], dirty: false,
  };
}

function getActiveTab(state: { tabs: Tab[]; activeTabId: string }): Tab | undefined {
  return state.tabs.find(t => t.id === state.activeTabId);
}

function updateActiveTab(
  state: { tabs: Tab[]; activeTabId: string },
  updater: (tab: Tab) => Partial<Tab>,
): Tab[] {
  return state.tabs.map(t =>
    t.id === state.activeTabId ? { ...t, ...updater(t), dirty: true } : t
  );
}

// ── Store ─────────────────────────────────────────────────────────────────────

const INITIAL_MAIN_TAB = makeInitialMainTab();

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [INITIAL_MAIN_TAB],
  activeTabId: INITIAL_MAIN_TAB.id,
  selectedNodeId: null,
  status: "idle",
  log: [],
  cmdHistory: {},
  variables: [],
  clipboard: [],

  get nodes() { return getActiveTab(get())?.nodes ?? []; },
  get edges() { return getActiveTab(get())?.edges ?? []; },

  // ── Tab management ─────────────────────────────────────────────────────────

  addMainTab() {
    const idx = get().tabs.filter(t => t.kind === "main").length + 1;
    const tab: Tab = {
      id: tabUid(), kind: "main", name: `Séquence ${idx}`,
      nodes: [makeStartNode()], edges: [], dirty: false,
    };
    set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, selectedNodeId: null }));
  },

  addFunctionTab(name = "nouvelle_fonction") {
    const safe = name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const finalName = safe || "nouvelle_fonction";
    const tab: Tab = {
      id: tabUid(), kind: "function", name: finalName,
      nodes: [makeFunctionArgsNode(), makeFunctionReturnNode()],
      edges: [], dirty: true,
    };
    set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, selectedNodeId: null }));
    return tab.id;
  },

  closeTab(id) {
    const { tabs, activeTabId } = get();
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
      newActive = newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0].id;
    }
    set({ tabs: newTabs, activeTabId: newActive, selectedNodeId: null });
  },

  setActiveTab(id) {
    set({ activeTabId: id, selectedNodeId: null });
  },

  renameTab(id, name) {
    const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    if (!safe) return;
    set(s => ({
      tabs: s.tabs.map(t => t.id === id ? { ...t, name: safe, dirty: true } : t),
    }));
  },

  // ── Convert tab kind ───────────────────────────────────────────────────────

  convertActiveTab() {
    const { tabs, activeTabId } = get();
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    if (tab.kind === "main") {
      // séquence → fonction :
      // remplacer le nœud "start" par "function_args" à la même position
      // ajouter "function_return" si absent
      const startNode = tab.nodes.find(n => n.data.kind === "start");
      const startPos  = startNode?.position ?? { x: 80, y: 80 };

      const argsNode   = makeFunctionArgsNode(startPos);
      const returnNode = makeFunctionReturnNode({ x: startPos.x, y: startPos.y + 300 });

      const newNodes: MacroNode[] = [
        argsNode,
        returnNode,
        ...tab.nodes.filter(n => n.data.kind !== "start"),
      ];

      // Rewire edges that pointed to/from the old start node
      const oldStartId = startNode?.id;
      const newEdges = tab.edges.map(e => ({
        ...e,
        source: e.source === oldStartId ? argsNode.id : e.source,
        target: e.target === oldStartId ? argsNode.id : e.target,
      }));

      set(s => ({
        tabs: s.tabs.map(t => t.id === activeTabId
          ? { ...t, kind: "function" as TabKind, nodes: newNodes, edges: newEdges, dirty: true, filePath: undefined }
          : t
        ),
        selectedNodeId: null,
      }));

    } else {
      // fonction → séquence :
      // remplacer "function_args" par "start", supprimer "function_return"
      const argsNode   = tab.nodes.find(n => n.data.kind === "function_args");
      const argsPos    = argsNode?.position ?? { x: 80, y: 80 };
      const returnNode = tab.nodes.find(n => n.data.kind === "function_return");

      const startNode = makeStartNode(argsPos);

      const newNodes: MacroNode[] = [
        startNode,
        ...tab.nodes.filter(n =>
          n.data.kind !== "function_args" && n.data.kind !== "function_return"
        ),
      ];

      // Rewire edges from/to old args node → new start node
      // Remove edges connected to return node
      const oldArgsId   = argsNode?.id;
      const oldReturnId = returnNode?.id;
      const newEdges = tab.edges
        .filter(e => e.source !== oldReturnId && e.target !== oldReturnId)
        .map(e => ({
          ...e,
          source: e.source === oldArgsId ? startNode.id : e.source,
          target: e.target === oldArgsId ? startNode.id : e.target,
        }));

      set(s => ({
        tabs: s.tabs.map(t => t.id === activeTabId
          ? { ...t, kind: "main" as TabKind, nodes: newNodes, edges: newEdges, dirty: true, filePath: undefined }
          : t
        ),
        selectedNodeId: null,
      }));
    }
  },

  // ── React Flow handlers ────────────────────────────────────────────────────

  onNodesChange(changes) {
    // Auto-select node when it finishes being moved (drag end)
    const dragEnd = changes.find(c => c.type === "position" && !(c as any).dragging);
    const newSel = dragEnd ? (dragEnd as any).id as string : undefined;
    set(s => ({
      tabs: updateActiveTab(s, t => ({ nodes: applyNodeChanges(changes, t.nodes) as MacroNode[] })),
      ...(newSel ? { selectedNodeId: newSel } : {}),
    }));
  },

  onEdgesChange(changes) {
    set(s => ({ tabs: updateActiveTab(s, t => ({ edges: applyEdgeChanges(changes, t.edges) })) }));
  },

  onConnect(connection) {
    set(s => ({
      tabs: updateActiveTab(s, t => {
        const targetAllowsMany =
          connection.targetHandle === "loop" || connection.targetHandle === "break";
        const filtered = t.edges.filter(e => {
          const dupSource =
            e.source === connection.source &&
            (e.sourceHandle ?? null) === (connection.sourceHandle ?? null);
          const dupTarget =
            !targetAllowsMany &&
            e.target === connection.target &&
            (e.targetHandle ?? null) === (connection.targetHandle ?? null);
          return !dupSource && !dupTarget;
        });
        return { edges: addEdge({ ...connection, type: "smoothstep" }, filtered) };
      }),
    }));
  },

  addNode(kind, position) {
    const activeTab = getActiveTab(get());
    if (!activeTab) return;

    const meta = BLOCK_CATALOG.find(m => m.kind === kind);
    if (!meta) { console.error(`[store] unknown kind "${kind}"`); return; }
    if (meta.mainOnly     && activeTab.kind !== "main")     return;
    if (meta.functionOnly && activeTab.kind !== "function") return;

    const unique = ["start", "function_args", "function_return"];
    if (unique.includes(kind) && activeTab.nodes.some(n => n.data.kind === kind)) return;

    const node: MacroNode = {
      id: uid(),
      type: nodeTypeForKind(kind),
      position,
      data: { kind, label: meta.label, color: meta.color, icon: meta.icon, ...meta.defaultData } as MacroNodeData,
      deletable: !unique.includes(kind),
    };
    set(s => ({ tabs: updateActiveTab(s, t => ({ nodes: [...t.nodes, node] })), selectedNodeId: node.id }));
  },

  updateNodeData(id, patch) {
    set(s => ({
      tabs: updateActiveTab(s, t => ({
        nodes: t.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } as MacroNode : n),
      })),
    }));
  },

  removeNode(id) {
    set(s => ({
      tabs: updateActiveTab(s, t => ({
        nodes: t.nodes.filter(n => n.id !== id),
        edges: t.edges.filter(e => e.source !== id && e.target !== id),
      })),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  selectNode(id) { set({ selectedNodeId: id }); },

  // ── Engine ─────────────────────────────────────────────────────────────────

  async runSequence() {
    const { pushLog } = get();
    const activeTab = getActiveTab(get());
    if (!activeTab || activeTab.kind !== "main") {
      pushLog({ level: "error", message: "Seul l'onglet séquence peut être exécuté." });
      return;
    }
    const { nodes, edges } = activeTab;
    if (!nodes.length) { pushLog({ level: "error", message: "Aucun bloc." }); return; }

    const graph = {
      nodes: nodes.map(n => ({ id: n.id, data: n.data })),
      edges: edges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
      })),
    };

    set({ status: "running" });
    pushLog({ level: "run", message: `Démarrage — ${nodes.length} nœuds, ${edges.length} connexions` });
    try {
      await invoke("run_sequence", { graph });
    } catch (e) {
      pushLog({ level: "error", message: String(e) });
      set({ status: "error" });
    }
  },

  async stopSequence() {
    await invoke("stop_sequence").catch(() => {});
    set({ status: "idle" });
    get().pushLog({ level: "info", message: "Séquence arrêtée." });
  },

  pushLog(entry) {
    set(s => ({ log: [...s.log.slice(-299), { ...entry, ts: Date.now() }] }));
  },
  clearLog() { set({ log: [] }); },

  pushCmdLog(nodeId, entry) {
    set(s => {
      const prev = s.cmdHistory[nodeId] ?? [];
      return { cmdHistory: { ...s.cmdHistory, [nodeId]: [...prev.slice(-49), entry] } };
    });
  },

  setVariable(name, value, description = "") {
    set(s => {
      const existing = s.variables.findIndex(v => v.name === name);
      if (existing >= 0) {
        const vars = [...s.variables]; vars[existing] = { name, value, description }; return { variables: vars };
      }
      return { variables: [...s.variables, { name, value, description }] };
    });
  },
  removeVariable(name) { set(s => ({ variables: s.variables.filter(v => v.name !== name) })); },

  // ── Persistence ────────────────────────────────────────────────────────────

  async saveActiveTab() {
    const { tabs, activeTabId, saveFunction } = get();
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    if (tab.kind === "function") {
      await saveFunction(activeTabId);
    } else {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          title: "Sauvegarder la séquence",
          filters: [{ name: "Auto Bot Sequence", extensions: ["absq"] }],
          defaultPath: `${tab.name}.absq`,
        });
        if (!path) return;
        const data = JSON.stringify({ nodes: tab.nodes, edges: tab.edges, variables: get().variables }, null, 2);
        await invoke("write_text_file_native", { path, content: data });
        set(s => ({ tabs: s.tabs.map(t => t.id === activeTabId ? { ...t, dirty: false, filePath: path } : t) }));
        get().pushLog({ level: "ok", message: `Sauvegardé : ${path}` });
      } catch (e) {
        get().pushLog({ level: "error", message: `Erreur sauvegarde: ${String(e)}` });
      }
    }
  },

  async saveFunction(tabId) {
    const { tabs, pushLog } = get();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || tab.kind !== "function") return;
    try {
      // Ensure we always have a valid name
      const tabName = (tab.name && tab.name !== "undefined") ? tab.name : "nouvelle_fonction";

      const argsNode = tab.nodes.find(n => n.data.kind === "function_args");
      const args = (argsNode?.data as { args?: unknown[] })?.args ?? [];

      const payload = {
        name: tabName, args,
        nodes: tab.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
        edges: tab.edges.map(e => ({
          id: e.id, source: e.source, target: e.target,
          sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
        })),
      };

      // Always compute path from the current tab name (so rename = new file)
      let path: string;
      try {
        const exeDir = await invoke<string>("get_exe_dir");
        // If the tab already had a filePath from a previous save, use its directory;
        // otherwise default to Fonctions/
        const dir = tab.filePath
          ? tab.filePath.replace(/[\\/][^\\/]+$/, "")  // strip filename, keep dir
          : `${exeDir}/Fonctions`;
        path = `${dir}/${tabName}.abfnc`;
      } catch {
        // get_exe_dir not available (dev mode) → ask user
        const { save } = await import("@tauri-apps/plugin-dialog");
        const chosen = await save({
          title: "Sauvegarder la fonction",
          filters: [{ name: "Auto Bot Function", extensions: ["abfnc"] }],
          defaultPath: `${tabName}.abfnc`,
        });
        if (!chosen) return;
        path = chosen;
      }

      await invoke("write_text_file_native", { path, content: JSON.stringify(payload, null, 2) });
      set(s => ({
        tabs: s.tabs.map(t => t.id === tabId ? { ...t, dirty: false, filePath: path } : t),
      }));
      pushLog({ level: "ok", message: `Fonction sauvegardée : ${path}` });
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur sauvegarde fonction: ${String(e)}` });
    }
  },

  async openSequence() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: "Ouvrir une séquence",
        filters: [{ name: "Auto Bot Sequence", extensions: ["absq"] }],
        multiple: false, directory: false,
      }) as string | null;
      if (path) {
        await get().openSequenceWithPath(path);
      }
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur dialogue: ${String(e)}` });
    }
  },

  async openSequenceWithPath(path: string) {
    const { pushLog, tabs } = get();
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const existing = tabs.find(t => t.filePath === path);
      if (existing) { set({ activeTabId: existing.id }); return; }
      const raw = await readTextFile(path);
      const data = JSON.parse(raw) as { nodes: MacroNode[]; edges: MacroEdge[]; variables?: VarEntry[] };
      const baseName = path.split(/[/\\]/).pop()?.replace(/\.absq$/, "") ?? "Séquence";
      const newTab: Tab = {
        id: tabUid(), kind: "main", name: baseName,
        nodes: data.nodes ?? [], edges: data.edges ?? [],
        filePath: path, dirty: false,
      };
      set(s => ({
        tabs: [...s.tabs, newTab], activeTabId: newTab.id,
        variables: data.variables ?? s.variables, selectedNodeId: null,
      }));
      pushLog({ level: "ok", message: `Chargé : ${path} (${data.nodes?.length} nœuds)` });
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur chargement séquence: ${String(e)}` });
    }
  },

  async openFunction() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: "Ouvrir une fonction",
        filters: [{ name: "Auto Bot Function", extensions: ["abfnc"] }],
        multiple: false, directory: false,
      }) as string | null;
      if (path) {
        await get().openFunctionWithPath(path);
      }
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur dialogue: ${String(e)}` });
    }
  },

  async openFunctionWithPath(path: string) {
    const { pushLog, tabs } = get();
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const existing = tabs.find(t => t.filePath === path);
      if (existing) { set({ activeTabId: existing.id }); return; }
      const raw = await readTextFile(path);
      const data = JSON.parse(raw) as { name?: string; args?: unknown[]; nodes: { id: string; position: {x:number;y:number}; data: MacroNodeData }[]; edges: MacroEdge[] };
      const baseName = path.split(/[/\\]/).pop()?.replace(/\.abfnc$/, "") ?? "fonction";
      const tabName = (data.name && data.name !== "undefined") ? data.name : baseName;
      const nodes: MacroNode[] = data.nodes.map(n => ({
        id: n.id, type: nodeTypeForKind(n.data.kind as BlockKind),
        position: n.position ?? { x: 0, y: 0 },
        data: n.data,
        deletable: !["function_args", "function_return"].includes(n.data.kind),
      }));
      const newTab: Tab = {
        id: tabUid(), kind: "function", name: tabName,
        nodes, edges: data.edges ?? [], filePath: path, dirty: false,
      };
      set(s => ({ tabs: [...s.tabs, newTab], activeTabId: newTab.id, selectedNodeId: null }));
      pushLog({ level: "ok", message: `Fonction chargée : ${path}` });
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur chargement fonction: ${String(e)}` });
    }
  },

  async openAny() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: "Ouvrir un fichier",
        filters: [{ name: "Auto Bot Séquence / Fonction", extensions: ["absq", "abfnc"] }],
        multiple: false, directory: false,
      }) as string | null;
      if (!path) return;
      if (path.endsWith(".abfnc")) {
        await get().openFunctionWithPath(path);
      } else {
        await get().openSequenceWithPath(path);
      }
    } catch (e) {
      get().pushLog({ level: "error", message: `Erreur dialogue: ${String(e)}` });
    }
  },

  // ── Clipboard ──────────────────────────────────────────────────────────────

  copyNodes(ids) {
    const activeTab = getActiveTab(get());
    if (!activeTab) return;
    const copied = activeTab.nodes.filter(n => ids.includes(n.id) && n.deletable !== false);
    set({ clipboard: copied });
  },

  pasteNodes() {
    const { clipboard } = get();
    if (!clipboard.length) return;
    const offset = { x: 40, y: 40 };
    const newNodes: MacroNode[] = clipboard.map(n => ({
      ...n,
      id: `n${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: false,
    }));
    set(s => ({ tabs: updateActiveTab(s, t => ({ nodes: [...t.nodes, ...newNodes] })) }));
  },

  // ── Engine listeners ───────────────────────────────────────────────────────

  initEngineListeners() {
    const unsubs: Array<() => void> = [];
    const sub = (evt: string, fn: (p: unknown) => void) =>
      listen(evt, e => fn(e.payload)).then(u => unsubs.push(u));
    sub("engine://started",     () => set({ status: "running" }));
    sub("engine://done",        () => { set({ status: "idle" }); get().pushLog({ level: "ok", message: "Séquence terminée ✓" }); });
    sub("engine://stopped",     () => set({ status: "idle" }));
    sub("engine://error",       m => { set({ status: "error" }); get().pushLog({ level: "error", message: String(m) }); });
    sub("engine://log",         m => { get().pushLog({ level: "info", message: String(m) }); });
    sub("engine://block-start", b => get().pushLog({ level: "run",  message: `→ ${(b as { kind?: string })?.kind ?? "?"}` }));
    sub("engine://block-done",  b => get().pushLog({ level: "ok",   message: `✓ ${(b as { kind?: string })?.kind ?? "?"}` }));
    sub("engine://for-tick",    d => { const p = d as { var?: string; value?: string }; get().pushLog({ level: "info", message: `${p?.var ?? "i"} = ${p?.value ?? "?"}` }); });
    sub("engine://if-result",   r => get().pushLog({ level: "info", message: `si → ${r ? "vrai ✓" : "faux ✗"}` }));
    sub("engine://pixel-result",r => get().pushLog({ level: "info", message: `pixel → ${r ? "✓ match" : "✗ no match"}` }));
    sub("engine://image-result",r => {
      const p = r as { matched?: boolean; iteration?: number; iterations?: number };
      get().pushLog({ level: "info", message: `image ${p.iteration ?? "?"}/${p.iterations ?? "?"} -> ${p.matched ? "trouvé" : "non trouvé"}` });
    });
    sub("engine://cmd-log", d => {
      const p = d as { node_id?: string; entry?: CmdLogEntry };
      if (p?.node_id && p?.entry) get().pushCmdLog(p.node_id, p.entry);
    });
    return () => unsubs.forEach(u => u());
  },
}));
