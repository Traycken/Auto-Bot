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
  saveRestartSnapshot: () => void;
  saveRestartSnapshotWithNodePatch: (id: string, patch: Record<string, unknown>) => void;
  initEngineListeners: () => () => void;

  past: Array<{ tabs: Tab[]; variables: VarEntry[] }>;
  future: Array<{ tabs: Tab[]; variables: VarEntry[] }>;
  pushHistory: (force?: boolean) => void;
  undo: () => void;
  redo: () => void;
  saveActiveTab: () => Promise<void>;
  saveActiveTabAs: () => Promise<void>;
  openSequence: () => Promise<void>;
  openFunction: () => Promise<void>;
  openSequenceWithPath: (path: string) => Promise<void>;
  openFunctionWithPath: (path: string) => Promise<void>;
  openAny: () => Promise<void>;
  saveFunction: (tabId: string) => Promise<void>;

  clipboard: MacroNode[];
  copyNodes: (ids: string[]) => void;
  pasteNodes: () => void;
  translations: Record<string, string>;
  loadTranslations: (lang: string) => Promise<void>;
  t: (key: string, defaultValue?: string) => string;

  activeNodeId: string | null;
  lastNodeId: string | null;
  waitProgress: Record<string, number>;
  forTicks: Record<string, string>;
  edgeThickness: number;
  setEdgeThickness: (t: number) => void;
  clearCmdHistory: (nodeId: string) => void;
  unsupervisedCycles: string[]; // Edge IDs causing cycle
  acceptUnsupervisedRun: boolean;
  setAcceptUnsupervisedRun: (v: boolean) => void;
}

export function detectUnsupervisedCycles(nodes: MacroNode[], edges: MacroEdge[]): string[] {
  const edgeMap = new Map<string, string[]>(); // node -> edges
  for (const edge of edges) {
    if (!edgeMap.has(edge.source)) {
      edgeMap.set(edge.source, []);
    }
    edgeMap.get(edge.source)!.push(edge.id);
  }

  const nodeMap = new Map<string, MacroNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const cycleEdges = new Set<string>();

  function dfs(nodeId: string, visited: Set<string>, edgePath: string[]) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const outEdges = edgeMap.get(nodeId) ?? [];
    for (const edgeId of outEdges) {
      const edge = edges.find(e => e.id === edgeId);
      if (!edge) continue;

      const neighborId = edge.target;
      const neighborIndex = visited.has(neighborId) ? edgePath.findIndex(eid => {
        const eg = edges.find(e => e.id === eid);
        return eg && eg.source === neighborId;
      }) : -1;

      if (neighborIndex !== -1) {
        // Cycle detected! Check if any node in the cycle path is supervised
        const cycleEdgeIds = edgePath.slice(neighborIndex);
        cycleEdgeIds.push(edgeId);

        let supervised = false;
        for (const eid of cycleEdgeIds) {
          const eg = edges.find(e => e.id === eid);
          if (eg) {
            const srcNode = nodeMap.get(eg.source);
            if (srcNode && ["for_loop", "iterations", "foreach"].includes(srcNode.data.kind)) {
              supervised = true;
              break;
            }
          }
        }

        if (!supervised) {
          cycleEdges.add(edgeId);
        }
      } else if (!visited.has(neighborId)) {
        visited.add(neighborId);
        edgePath.push(edgeId);
        dfs(neighborId, visited, edgePath);
        edgePath.pop();
        visited.delete(neighborId);
      }
    }
  }

  // Run DFS from each node to ensure we cover disconnected subgraphs
  for (const node of nodes) {
    dfs(node.id, new Set([node.id]), []);
  }

  return Array.from(cycleEdges);
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
  if (kind === "switch")          return "switchNode";
  if ((kind as string) === "history") return "historyNode";
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
const RESTART_SNAPSHOT_KEY = "autobot:admin-restart-snapshot";

function loadRestartSnapshot(): Partial<Pick<EditorStore, "tabs" | "activeTabId" | "selectedNodeId" | "variables">> | null {
  try {
    const raw = localStorage.getItem(RESTART_SNAPSHOT_KEY);
    if (!raw) return null;
    localStorage.removeItem(RESTART_SNAPSHOT_KEY);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tabs) || typeof parsed.activeTabId !== "string") return null;
    return {
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId,
      selectedNodeId: parsed.selectedNodeId ?? null,
      variables: Array.isArray(parsed.variables) ? parsed.variables : [],
    };
  } catch {
    return null;
  }
}

const restartSnapshot = loadRestartSnapshot();
let historyTimeout: any = null;
let lastHistoryState: string | null = null;

export const useEditorStore = create<EditorStore>((originalSet, get) => {
  // Override set locally so all actions automatically trigger the update of nodes & edges
  const set = (
    partial: EditorStore | Partial<EditorStore> | ((state: EditorStore) => EditorStore | Partial<EditorStore>),
    replace?: boolean
  ) => {
    originalSet((state: EditorStore) => {
      const next = typeof partial === "function" ? (partial as Function)(state) : partial;
      const merged = { ...state, ...next };

      const activeTab = merged.tabs.find((t: any) => t.id === merged.activeTabId);
      merged.nodes = activeTab?.nodes ?? [];

      if (activeTab) {
        const baseEdges = activeTab.edges;
        const cycles = detectUnsupervisedCycles(activeTab.nodes, baseEdges);
        const virtualEdges: any[] = [];
        activeTab.nodes.forEach((node: any) => {
          if ((node.data?.kind as string) === "history" && node.data?.targetNodeId) {
            virtualEdges.push({
              id: `virt-edge-${node.id}`,
              source: node.data.targetNodeId as string,
              target: node.id,
              targetHandle: "virt_target",
              type: "smoothstep",
              style: { strokeDasharray: "3 3", stroke: "#64748B", opacity: 0.6 },
              animated: false,
              reconnectable: false,
              focusable: false,
              deletable: false,
            });
          }
        });

        const processedBaseEdges = baseEdges.map((edge: any) => {
          if (cycles.includes(edge.id)) {
            return {
              ...edge,
              style: { ...edge.style, stroke: "#E24B4A", strokeWidth: 3 },
              animated: true,
            };
          }
          return edge;
        });

        merged.edges = [...processedBaseEdges, ...virtualEdges];
      } else {
        merged.edges = [];
      }

      return merged;
    }, replace);
  };

  // Compute initial states
  const initialTabs = restartSnapshot?.tabs ?? [INITIAL_MAIN_TAB];
  const initialActiveTabId = restartSnapshot?.activeTabId ?? INITIAL_MAIN_TAB.id;
  const activeTab = initialTabs.find(t => t.id === initialActiveTabId);
  const initialNodes = activeTab?.nodes ?? [];
  const baseEdges = activeTab?.edges ?? [];
  const cycles = detectUnsupervisedCycles(initialNodes, baseEdges);
  const virtualEdges: any[] = [];
  initialNodes.forEach(node => {
    if ((node.data?.kind as string) === "history" && node.data?.targetNodeId) {
      virtualEdges.push({
        id: `virt-edge-${node.id}`,
        source: node.data.targetNodeId as string,
        target: node.id,
        targetHandle: "virt_target",
        type: "smoothstep",
        style: { strokeDasharray: "3 3", stroke: "#64748B", opacity: 0.6 },
        animated: false,
        reconnectable: false,
        focusable: false,
        deletable: false,
      });
    }
  });
  const processedBaseEdges = baseEdges.map(edge => {
    if (cycles.includes(edge.id)) {
      return {
        ...edge,
        style: { ...edge.style, stroke: "#E24B4A", strokeWidth: 3 },
        animated: true,
      };
    }
    return edge;
  });
  const initialEdges = [...processedBaseEdges, ...virtualEdges];

  return {
    tabs: initialTabs,
    activeTabId: initialActiveTabId,
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeId: restartSnapshot?.selectedNodeId ?? null,
    status: "idle",
    past: [],
    future: [],
    pushHistory(force = false) {
      const { tabs, variables, past } = get();
      const stateStr = JSON.stringify({ tabs, variables });
      
      if (lastHistoryState === stateStr) {
        return;
      }

      if (historyTimeout && force) {
        clearTimeout(historyTimeout);
        historyTimeout = null;
      }
      
      if (!historyTimeout) {
        const clonedTabs = JSON.parse(JSON.stringify(tabs));
        const clonedVars = JSON.parse(JSON.stringify(variables));
        
        if (past.length > 0) {
          const last = past[past.length - 1];
          if (JSON.stringify(last.tabs) === JSON.stringify(clonedTabs) && JSON.stringify(last.variables) === JSON.stringify(clonedVars)) {
            return;
          }
        }

        const newPast = [...past, { tabs: clonedTabs, variables: clonedVars }];
        if (newPast.length > 50) newPast.shift();
        originalSet({ past: newPast, future: [] });
        lastHistoryState = stateStr;
      }
      
      if (!force) {
        if (historyTimeout) clearTimeout(historyTimeout);
        historyTimeout = setTimeout(() => {
          historyTimeout = null;
        }, 800);
      }
    },

    undo() {
      const { past, future, tabs, variables } = get();
      if (past.length === 0) return;
      
      if (historyTimeout) {
        clearTimeout(historyTimeout);
        historyTimeout = null;
      }

      const currentCloned = {
        tabs: JSON.parse(JSON.stringify(tabs)),
        variables: JSON.parse(JSON.stringify(variables)),
      };
      
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      const newFuture = [currentCloned, ...future];
      
      set({
        tabs: previous.tabs,
        variables: previous.variables,
        past: newPast,
        future: newFuture,
      });
      
      lastHistoryState = JSON.stringify({ tabs: previous.tabs, variables: previous.variables });
    },

    redo() {
      const { past, future, tabs, variables } = get();
      if (future.length === 0) return;
      
      if (historyTimeout) {
        clearTimeout(historyTimeout);
        historyTimeout = null;
      }

      const currentCloned = {
        tabs: JSON.parse(JSON.stringify(tabs)),
        variables: JSON.parse(JSON.stringify(variables)),
      };

      const next = future[0];
      const newFuture = future.slice(1);
      const newPast = [...past, currentCloned];
      
      set({
        tabs: next.tabs,
        variables: next.variables,
        past: newPast,
        future: newFuture,
      });
      
      lastHistoryState = JSON.stringify({ tabs: next.tabs, variables: next.variables });
    },
    log: [],
    cmdHistory: {},
    variables: restartSnapshot?.variables ?? [],
    clipboard: [],
    translations: {},
    t(key: string, defaultValue?: string) {
      return get().translations[key] ?? defaultValue ?? key;
    },
    activeNodeId: null,
    lastNodeId: null,
    waitProgress: {},
    forTicks: {},
    edgeThickness: 4,
    setEdgeThickness: (t) => set({ edgeThickness: t }),
    unsupervisedCycles: [],
    acceptUnsupervisedRun: false,
    setAcceptUnsupervisedRun: (v) => set({ acceptUnsupervisedRun: v }),

    async loadTranslations(lang: string) {
      try {
        const map = await invoke<Record<string, string>>("load_translations", { lang });
        set({ translations: map });
      } catch (e) {
        console.error("Failed to load translations:", e);
      }
    },

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
    get().pushHistory(true);
    const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    if (!safe) return;
    set(s => ({
      tabs: s.tabs.map(t => t.id === id ? { ...t, name: safe, dirty: true } : t),
    }));
  },

  // ── Convert tab kind ───────────────────────────────────────────────────────

  convertActiveTab() {
    get().pushHistory(true);
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
    const hasStructuralChange = changes.some(c => c.type === "remove");
    const hasPositionChange = changes.some(c => c.type === "position");
    if (hasStructuralChange) {
      get().pushHistory(true);
    } else if (hasPositionChange) {
      get().pushHistory(false);
    }
    // Auto-select node when it finishes being moved (drag end)
    const dragEnd = changes.find(c => c.type === "position" && !(c as any).dragging);
    const newSel = dragEnd ? (dragEnd as any).id as string : undefined;
    set(s => ({
      tabs: updateActiveTab(s, t => ({ nodes: applyNodeChanges(changes, t.nodes) as MacroNode[] })),
      ...(newSel ? { selectedNodeId: newSel } : {}),
    }));
  },

  onEdgesChange(changes) {
    const hasStructuralChange = changes.some(c => c.type === "remove");
    if (hasStructuralChange) {
      get().pushHistory(true);
    }
    set(s => ({ tabs: updateActiveTab(s, t => ({ edges: applyEdgeChanges(changes, t.edges) })) }));
  },

  onConnect(connection) {
    if (connection.source === connection.target) {
      console.warn("Self-connections are blocked.");
      return;
    }
    get().pushHistory(true);
    set(s => ({
      tabs: updateActiveTab(s, t => {
        // Filter out any existing edge that starts from the same output handle (source/sourceHandle)
        const filtered = t.edges.filter(e => {
          const isSameSourceHandle =
            e.source === connection.source &&
            (e.sourceHandle ?? null) === (connection.sourceHandle ?? null);
          return !isSameSourceHandle;
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

    get().pushHistory(true);
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
    get().pushHistory(false);
    set(s => ({
      tabs: updateActiveTab(s, t => ({
        nodes: t.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } as MacroNode : n),
      })),
    }));
  },

  removeNode(id) {
    get().pushHistory(true);
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
    const { pushLog, acceptUnsupervisedRun } = get();
    const activeTab = getActiveTab(get());
    if (!activeTab || activeTab.kind !== "main") {
      pushLog({ level: "error", message: "Seul l'onglet séquence peut être exécuté." });
      return;
    }
    const { nodes, edges } = activeTab;
    if (!nodes.length) { pushLog({ level: "error", message: "Aucun bloc." }); return; }

    const cycles = detectUnsupervisedCycles(nodes, edges);
    if (cycles.length > 0 && !acceptUnsupervisedRun) {
      throw new Error("unsupervised-cycle-detected");
    }

    const runnableNodes = nodes.filter(n => (n.data.kind as unknown as string) !== "history");
    const runnableNodeIds = new Set(runnableNodes.map(n => n.id));
    const runnableEdges = edges.filter(e => runnableNodeIds.has(e.source) && runnableNodeIds.has(e.target) && !e.id.startsWith("virt-edge-"));

    const graph = {
      nodes: runnableNodes.map(n => ({ id: n.id, data: n.data })),
      edges: runnableEdges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
      })),
    };

    set({ status: "running" });
    pushLog({ level: "run", message: `Démarrage — ${runnableNodes.length} nœuds, ${runnableEdges.length} connexions` });
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

  saveRestartSnapshot() {
    const { tabs, activeTabId, selectedNodeId, variables } = get();
    localStorage.setItem(RESTART_SNAPSHOT_KEY, JSON.stringify({
      tabs,
      activeTabId,
      selectedNodeId,
      variables,
      savedAt: Date.now(),
    }));
  },
  saveRestartSnapshotWithNodePatch(id, patch) {
    const state = get();
    const tabs = state.tabs.map(t => ({
      ...t,
      nodes: t.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } as MacroNode : n),
      dirty: true,
    }));
    localStorage.setItem(RESTART_SNAPSHOT_KEY, JSON.stringify({
      tabs,
      activeTabId: state.activeTabId,
      selectedNodeId: state.selectedNodeId,
      variables: state.variables,
      savedAt: Date.now(),
    }));
    set({ tabs });
  },

  pushCmdLog(nodeId, entry) {
    set(s => {
      const prev = s.cmdHistory[nodeId] ?? [];
      return { cmdHistory: { ...s.cmdHistory, [nodeId]: [...prev.slice(-49), entry] } };
    });
  },

  clearCmdHistory(nodeId) {
    set(s => {
      const newHistory = { ...s.cmdHistory };
      delete newHistory[nodeId];
      return { cmdHistory: newHistory };
    });
  },

  setVariable(name, value, description = "") {
    get().pushHistory(true);
    set(s => {
      const existing = s.variables.findIndex(v => v.name === name);
      if (existing >= 0) {
        const vars = [...s.variables]; vars[existing] = { name, value, description }; return { variables: vars };
      }
      return { variables: [...s.variables, { name, value, description }] };
    });
  },
  removeVariable(name) {
    get().pushHistory(true);
    set(s => ({ variables: s.variables.filter(v => v.name !== name) }));
  },

  // ── Persistence ────────────────────────────────────────────────────────────

  async saveActiveTab() {
    const { tabs, activeTabId, saveFunction } = get();
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    if (tab.kind === "function") {
      await saveFunction(activeTabId);
    } else {
      if (tab.filePath) {
        try {
          const data = JSON.stringify({ nodes: tab.nodes, edges: tab.edges, variables: get().variables }, null, 2);
          await invoke("write_text_file_native", { path: tab.filePath, content: data });
          set(s => ({ tabs: s.tabs.map(t => t.id === activeTabId ? { ...t, dirty: false } : t) }));
          get().pushLog({ level: "ok", message: `Sauvegardé : ${tab.filePath}` });
        } catch (e) {
          get().pushLog({ level: "error", message: `Erreur sauvegarde: ${String(e)}` });
        }
      } else {
        try {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const path = await save({
            title: "Sauvegarder la séquence",
            filters: [{ name: "Auto Bot Sequence", extensions: ["absqc"] }],
            defaultPath: `${tab.name}.absqc`,
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
    }
  },

  async saveActiveTabAs() {
    const { tabs, activeTabId } = get();
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    if (tab.kind === "function") {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const chosen = await save({
          title: "Sauvegarder la fonction sous...",
          filters: [{ name: "Auto Bot Function", extensions: ["abfnc"] }],
          defaultPath: tab.filePath || `${tab.name}.abfnc`,
        });
        if (!chosen) return;
        const newName = chosen.split(/[/\\]/).pop()?.replace(/\.abfnc$/, "") ?? tab.name;

        const argsNode = tab.nodes.find(n => n.data.kind === "function_args");
        const args = (argsNode?.data as { args?: unknown[] })?.args ?? [];
        const payload = {
          name: newName, args,
          nodes: tab.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
          edges: tab.edges.map(e => ({
            id: e.id, source: e.source, target: e.target,
            sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
          })),
        };

        await invoke("write_text_file_native", { path: chosen, content: JSON.stringify(payload, null, 2) });
        set(s => ({
          tabs: s.tabs.map(t => t.id === activeTabId ? { ...t, name: newName, dirty: false, filePath: chosen } : t),
        }));
        get().pushLog({ level: "ok", message: `Fonction sauvegardée : ${chosen}` });
      } catch (e) {
        get().pushLog({ level: "error", message: `Erreur enregistrer sous fonction: ${String(e)}` });
      }
    } else {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          title: "Sauvegarder la séquence sous...",
          filters: [{ name: "Auto Bot Sequence", extensions: ["absqc"] }],
          defaultPath: tab.filePath || `${tab.name}.absqc`,
        });
        if (!path) return;
        const newName = path.split(/[/\\]/).pop()?.replace(/\.absqc$/, "") ?? tab.name;
        const data = JSON.stringify({ nodes: tab.nodes, edges: tab.edges, variables: get().variables }, null, 2);
        await invoke("write_text_file_native", { path, content: data });
        set(s => ({ tabs: s.tabs.map(t => t.id === activeTabId ? { ...t, name: newName, dirty: false, filePath: path } : t) }));
        get().pushLog({ level: "ok", message: `Sauvegardé : ${path}` });
      } catch (e) {
        get().pushLog({ level: "error", message: `Erreur enregistrer sous: ${String(e)}` });
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
        filters: [{ name: "Auto Bot Sequence", extensions: ["absqc", "absq"] }],
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
      const baseName = path.split(/[/\\]/).pop()?.replace(/\.(absq|absqc)$/, "") ?? "Séquence";
      
      const sanitizeNodeData = (d: any) => {
        if (!d) return d;
        const res = { ...d };
        if (res.kind === "ocr" && "LANG" in res) {
          if (res.lang === undefined) res.lang = res.LANG;
          delete res.LANG;
        }
        if (res.kind === "key_press" && "hold ms" in res) {
          if (res.hold_ms === undefined) res.hold_ms = res["hold ms"];
          delete res["hold ms"];
        }
        if (res.kind === "mouse_move" && "Relative" in res) {
          if (res.relative === undefined) res.relative = res.Relative;
          delete res.Relative;
        }
        if (res.kind === "mouse_click") {
          if ("double click" in res) {
            if (res.double_click === undefined) res.double_click = res["double click"];
            delete res["double click"];
          }
          if ("delay after ms" in res) {
            if (res.delay_after_ms === undefined) res.delay_after_ms = res["delay after ms"];
            delete res["delay after ms"];
          }
        }
        if (res.kind === "type_text" && "delay between chars ms" in res) {
          if (res.delay_between_chars_ms === undefined) res.delay_between_chars_ms = res["delay between chars ms"];
          delete res["delay between chars ms"];
        }
        if ("Travel MS" in res) {
          if (res.travel_ms === undefined) res.travel_ms = res["Travel MS"];
          delete res["Travel MS"];
        }
        if ("travel ms" in res) {
          if (res.travel_ms === undefined) res.travel_ms = res["travel ms"];
          delete res["travel ms"];
        }
        
        // Clean other direct legacy duplicates
        const keys = Object.keys(res);
        for (const k of keys) {
          if (k === "LANG") {
            if (res.lang === undefined) res.lang = res[k];
            delete res[k];
          } else if (k === "hold ms") {
            if (res.hold_ms === undefined) res.hold_ms = res[k];
            delete res[k];
          } else if (k === "Relative") {
            if (res.relative === undefined) res.relative = res[k];
            delete res[k];
          } else if (k === "double click") {
            if (res.double_click === undefined) res.double_click = res[k];
            delete res[k];
          } else if (k === "delay after ms") {
            if (res.delay_after_ms === undefined) res.delay_after_ms = res[k];
            delete res[k];
          } else if (k === "delay between chars ms") {
            if (res.delay_between_chars_ms === undefined) res.delay_between_chars_ms = res[k];
            delete res[k];
          } else if (k === "Travel MS") {
            if (res.travel_ms === undefined) res.travel_ms = res[k];
            delete res[k];
          } else if (k === "travel ms") {
            if (res.travel_ms === undefined) res.travel_ms = res[k];
            delete res[k];
          }
        }
        return res;
      };

      const nodes: MacroNode[] = (data.nodes ?? []).map(n => ({
        ...n,
        data: sanitizeNodeData(n.data),
      }));

      const newTab: Tab = {
        id: tabUid(), kind: "main", name: baseName,
        nodes, edges: data.edges ?? [],
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
      
      const sanitizeNodeData = (d: any) => {
        if (!d) return d;
        const res = { ...d };
        if (res.kind === "ocr" && "LANG" in res) {
          if (res.lang === undefined) res.lang = res.LANG;
          delete res.LANG;
        }
        if (res.kind === "key_press" && "hold ms" in res) {
          if (res.hold_ms === undefined) res.hold_ms = res["hold ms"];
          delete res["hold ms"];
        }
        if (res.kind === "mouse_move" && "Relative" in res) {
          if (res.relative === undefined) res.relative = res.Relative;
          delete res.Relative;
        }
        if (res.kind === "mouse_click") {
          if ("double click" in res) {
            if (res.double_click === undefined) res.double_click = res["double click"];
            delete res["double click"];
          }
          if ("delay after ms" in res) {
            if (res.delay_after_ms === undefined) res.delay_after_ms = res["delay after ms"];
            delete res["delay after ms"];
          }
        }
        if (res.kind === "type_text" && "delay between chars ms" in res) {
          if (res.delay_between_chars_ms === undefined) res.delay_between_chars_ms = res["delay between chars ms"];
          delete res["delay between chars ms"];
        }
        if ("Travel MS" in res) {
          if (res.travel_ms === undefined) res.travel_ms = res["Travel MS"];
          delete res["Travel MS"];
        }
        if ("travel ms" in res) {
          if (res.travel_ms === undefined) res.travel_ms = res["travel ms"];
          delete res["travel ms"];
        }
        
        // Clean other direct legacy duplicates
        const keys = Object.keys(res);
        for (const k of keys) {
          if (k === "LANG") {
            if (res.lang === undefined) res.lang = res[k];
            delete res[k];
          } else if (k === "hold ms") {
            if (res.hold_ms === undefined) res.hold_ms = res[k];
            delete res[k];
          } else if (k === "Relative") {
            if (res.relative === undefined) res.relative = res[k];
            delete res[k];
          } else if (k === "double click") {
            if (res.double_click === undefined) res.double_click = res[k];
            delete res[k];
          } else if (k === "delay after ms") {
            if (res.delay_after_ms === undefined) res.delay_after_ms = res[k];
            delete res[k];
          } else if (k === "delay between chars ms") {
            if (res.delay_between_chars_ms === undefined) res.delay_between_chars_ms = res[k];
            delete res[k];
          } else if (k === "Travel MS") {
            if (res.travel_ms === undefined) res.travel_ms = res[k];
            delete res[k];
          } else if (k === "travel ms") {
            if (res.travel_ms === undefined) res.travel_ms = res[k];
            delete res[k];
          }
        }
        return res;
      };

      const nodes: MacroNode[] = data.nodes.map(n => ({
        id: n.id, type: nodeTypeForKind(n.data.kind as BlockKind),
        position: n.position ?? { x: 0, y: 0 },
        data: sanitizeNodeData(n.data),
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
        filters: [{ name: "Auto Bot Séquence / Fonction", extensions: ["absqc", "absq", "abfnc"] }],
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
    invoke<{ language?: string }>("get_settings")
      .then(settings => {
        const lang = settings.language || "fr";
        get().loadTranslations(lang);
      })
      .catch(() => {
        get().loadTranslations("fr");
      });
    const unsubs: Array<() => void> = [];
    const sub = (evt: string, fn: (p: any) => void) =>
      listen(evt, e => fn(e.payload)).then(u => unsubs.push(u));
    
    const resetRuntimeFeedback = () => set({
      activeNodeId: null,
      lastNodeId: null,
      waitProgress: {},
      forTicks: {},
    });

    sub("engine://started",     () => { set({ status: "running" }); resetRuntimeFeedback(); });
    sub("engine://done",        () => { set({ status: "idle" }); resetRuntimeFeedback(); get().pushLog({ level: "ok", message: "Séquence terminée ✓" }); });
    sub("engine://stopped",     () => { set({ status: "idle" }); resetRuntimeFeedback(); });
    sub("engine://error",       m => { set({ status: "error" }); resetRuntimeFeedback(); get().pushLog({ level: "error", message: String(m) }); });
    sub("engine://log",         m => { get().pushLog({ level: "info", message: String(m) }); });
    
    sub("engine://block-start", b => {
      const payload = b as { node_id?: string; kind?: string };
      if (payload.node_id) {
        set(s => ({
          lastNodeId: s.activeNodeId,
          activeNodeId: payload.node_id ?? null
        }));

        // Capture screenshot of the selected zone during execution
        const activeTab = get().tabs.find(t => t.id === get().activeTabId);
        const node = activeTab?.nodes.find(n => n.id === payload.node_id);
        if (node) {
          const kind = node.data?.kind as string;
          const data = node.data as any;
          if (kind === "ocr" || kind === "vpo" || (kind === "ia" && data.mode === "image") || kind === "image_match") {
            const x = Number(kind === "image_match" ? data.region_x : data.x) || 0;
            const y = Number(kind === "image_match" ? data.region_y : data.y) || 0;
            const w = Number(kind === "image_match" ? data.region_w : data.width) || 300;
            const h = Number(kind === "image_match" ? data.region_h : data.height) || 100;
            const screen = Number(data.screen) || 0;
            invoke<string>("capture_region", { x, y, width: w, height: h, screen })
              .then(b64 => {
                get().updateNodeData(node.id, { last_capture: b64 });
              })
              .catch(() => {});
          }
        }
      }
      get().pushLog({ level: "run",  message: `→ ${payload.kind ?? "?"}` });
    });
    
    sub("engine://block-done",  b => {
      const payload = b as { node_id?: string; kind?: string };
      set({ activeNodeId: null });
      get().pushLog({ level: "ok",   message: `✓ ${payload.kind ?? "?"}` });
    });
    
    sub("engine://for-tick",    d => {
      const p = d as { node_id?: string; var?: string; value?: string };
      if (p?.node_id && p?.value) {
        set(s => ({
          forTicks: { ...s.forTicks, [p.node_id!]: p.value! }
        }));
      }
      get().pushLog({ level: "info", message: `${p?.var ?? "i"} = ${p?.value ?? "?"}` });
    });
    
    sub("engine://wait-progress", d => {
      const p = d as { node_id?: string; progress?: number };
      if (p?.node_id && typeof p.progress === "number") {
        set(s => ({
          waitProgress: { ...s.waitProgress, [p.node_id!]: p.progress! }
        }));
      }
    });

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

    sub("engine://request-run", () => {
      const s = get().status;
      if (s === "running") get().stopSequence(); else get().runSequence();
    });

    sub("engine://request-f8-capture", () => {
      invoke<{ x: number; y: number }>("get_cursor_position")
        .then(pos => {
          const state = get();
          // Update selected node coordinates if applicable
          const activeTab = state.tabs.find(t => t.id === state.activeTabId);
          if (activeTab && state.selectedNodeId) {
            const node = activeTab.nodes.find(n => n.id === state.selectedNodeId);
            if (node) {
              const kind = node.data?.kind;
              if (kind === "mouse_move" || kind === "mouse_click" || kind === "mouse_scroll" || kind === "pixel_color" || kind === "ocr") {
                state.updateNodeData(node.id, { x: String(pos.x), y: String(pos.y) });
              } else if (kind === "image_match") {
                state.updateNodeData(node.id, { region_x: String(pos.x), region_y: String(pos.y) });
              }
            }
          }
        })
        .catch(() => {});
    });

    return () => unsubs.forEach(u => u());
  },
};
});

export function t(key: string, defaultValue?: string): string {
  const trans = useEditorStore.getState().translations;
  return trans[key] ?? defaultValue ?? key;
}

export function useNodeWidth(): number {
  return useEditorStore(state => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab || activeTab.nodes.length === 0) return 200;
    
    let maxW = 200;
    for (const node of activeTab.nodes) {
      const label = node.data?.label ?? "";
      let w = label.length * 8 + 80;
      
      const kind = node.data?.kind;
      if (kind === "for_loop") {
        const d = node.data;
        const exprStr = `pour ${d.var_name || "i"} de ${d.from || "0"} à ${d.to || "10"} pas ${d.step || "1"}`;
        w = Math.max(w, exprStr.length * 7 + 30);
      } else if (kind === "if") {
        const condStr = `si ${node.data.condition || ""}`;
        w = Math.max(w, condStr.length * 7 + 30);
      } else if (kind === "math") {
        const mathStr = `${node.data.target_var || "result"} = ${node.data.expression || "0"}`;
        w = Math.max(w, mathStr.length * 7 + 30);
      } else if (kind === "random") {
        const randStr = `${node.data.var_name || "result"} = rnd(${node.data.min || "0"}, ${node.data.max || "100"})`;
        w = Math.max(w, randStr.length * 7 + 30);
      }
      
      if (w > maxW) {
        maxW = w;
      }
    }
    const snapped = Math.ceil(maxW / 20) * 20;
    return Math.max(180, Math.min(snapped, 360));
  });
}
