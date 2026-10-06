import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  Controls,
  Background,
  Connection,
  Edge,
  Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './store';
import { nodeTypes } from './nodes/CustomNodes';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="sidebar">
      <h2>Palette</h2>
      {Object.keys(nodeTypes).map((type) => (
        <div
          key={type}
          className="node-item"
          onDragStart={(event) => onDragStart(event, type)}
          draggable
        >
          {type}
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }}></div>
        </div>
      ))}
    </aside>
  );
};

const TopBar = () => {
  const { nodes, edges, backendStatus, setNodes, setEdges, triggerSimulation } = useGraphStore();
  const [saving, setSaving] = useState(false);
  const [loadingId, setLoadingId] = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/api/graphs`, { nodes, edges });
      alert(`Graph saved! ID: ${res.data.id}`);
    } catch (err) {
      alert('Failed to save');
    }
    setSaving(false);
  };

  const handleLoad = async () => {
    const id = prompt('Enter Graph ID to load:');
    if (!id) return;
    try {
      const res = await axios.get(`${API_URL}/api/graphs/${id}`);
      setNodes(res.data.nodes || []);
      setEdges(res.data.edges || []);
      triggerSimulation();
    } catch (err) {
      alert('Failed to load');
    }
  };

  return (
    <div className="top-bar">
      <div className="connection-status">
        <div className={`status-dot ${backendStatus}`}></div>
        <span style={{textTransform: 'capitalize'}}>{backendStatus === 'error' ? 'Disconnected' : backendStatus}</span>
      </div>
      <button className="btn" onClick={handleSave} disabled={saving}>Save</button>
      <button className="btn" onClick={handleLoad}>Load</button>
    </div>
  );
};

const Flow = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, triggerSimulation } = useGraphStore();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { value: type === 'Number' ? 0 : '' },
      };

      setNodes([...nodes, newNode]);
      triggerSimulation();
    },
    [screenToFlowPosition, nodes, setNodes, triggerSimulation],
  );

  return (
    <div className="canvas-container" ref={reactFlowWrapper}>
      <TopBar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#2e3340" gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default function App() {
  return (
    <div className="app-container">
      <ReactFlowProvider>
        <Sidebar />
        <Flow />
      </ReactFlowProvider>
    </div>
  );
}
