import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type BackendStatus = 'connected' | 'syncing' | 'disconnected' | 'error';

export interface GraphState {
  nodes: Node[];
  edges: Edge[];
  revision: number;
  nodeResults: Record<string, number>;
  nodeErrors: Record<string, string>;
  blockedNodes: string[];
  backendStatus: BackendStatus;
  
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  updateNodeData: (id: string, data: any) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  triggerSimulation: () => void;
}

let abortController: AbortController | null = null;
let debounceTimer: any = null;

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  revision: 0,
  nodeResults: {},
  nodeErrors: {},
  blockedNodes: [],
  backendStatus: 'connected',

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
    // Only trigger simulation if a node was added, removed, or dimensions changed significantly?
    // Actually, position changes shouldn't really trigger a sim, but node removal should.
    const needsSim = changes.some(c => c.type === 'remove' || c.type === 'add');
    if (needsSim) get().triggerSimulation();
  },
  
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
    get().triggerSimulation();
  },

  onConnect: (connection: Connection) => {
    // Basic validation: no input to input, etc. is handled by React Flow if configured right.
    // Also block connecting to itself
    if (connection.source === connection.target) return;
    
    // An input can only have one connection. Check if target targetHandle is already connected
    const existingEdge = get().edges.find(
      e => e.target === connection.target && e.targetHandle === connection.targetHandle
    );
    if (existingEdge) return; // Block it
    
    set({
      edges: addEdge(connection, get().edges),
    });
    get().triggerSimulation();
  },

  updateNodeData: (id: string, newData: any) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      }),
    });
    get().triggerSimulation();
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  triggerSimulation: () => {
    set((state) => ({ revision: state.revision + 1, backendStatus: 'syncing' }));
    
    if (debounceTimer) clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(async () => {
      const state = get();
      
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();
      
      try {
        const response = await axios.post(`${API_URL}/api/simulate`, {
          nodes: state.nodes.map(n => ({ id: n.id, type: n.type, data: n.data })),
          edges: state.edges,
          revision: state.revision
        }, {
          signal: abortController.signal
        });
        
        // Ensure this is the response for our latest revision
        if (response.data.revision === get().revision) {
          set({
            nodeResults: response.data.results || {},
            nodeErrors: response.data.errors || {},
            blockedNodes: response.data.blocked || [],
            backendStatus: 'connected'
          });
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          // Ignored
        } else {
          console.error("Simulation failed:", error);
          // If backend is unavailable
          set({ backendStatus: 'error' });
        }
      }
    }, 200); // 200ms debounce
  }
}));
