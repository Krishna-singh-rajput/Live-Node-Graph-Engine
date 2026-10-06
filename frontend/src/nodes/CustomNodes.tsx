import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useGraphStore } from '../store';

const NodeWrapper = ({ id, title, children, hasInput, inputs, hasOutput }: any) => {
  const result = useGraphStore((state) => state.nodeResults[id]);
  const error = useGraphStore((state) => state.nodeErrors[id]);
  const isBlocked = useGraphStore((state) => state.blockedNodes.includes(id));
  const selectedNodes = useGraphStore((state) => state.nodes.filter(n => n.selected).map(n => n.id));
  const isSelected = selectedNodes.includes(id);

  let statusClass = '';
  if (error) statusClass = 'error';
  else if (isBlocked) statusClass = 'blocked';

  return (
    <div className={`custom-node ${statusClass} ${isSelected ? 'selected' : ''}`}>
      <div className="node-header">
        {title}
        {error && <span className="status-badge status-error">Error</span>}
        {isBlocked && !error && <span className="status-badge status-blocked">Blocked</span>}
      </div>
      
      <div className="node-content">
        {children}
        
        {result !== undefined && !error && !isBlocked && (
          <div className="value-display">{Number(result).toFixed(4).replace(/\.?0+$/, '')}</div>
        )}
      </div>

      {hasInput && inputs && inputs.map((input: string, i: number) => (
        <Handle
          key={input}
          type="target"
          position={Position.Left}
          id={input}
          style={{ top: `${(i + 1) * 100 / (inputs.length + 1)}%` }}
          className="handle"
        />
      ))}
      
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="handle"
        />
      )}
    </div>
  );
};

export const NumberNode = ({ id, data }: any) => {
  const updateNodeData = useGraphStore(state => state.updateNodeData);
  
  return (
    <NodeWrapper id={id} title="Number" hasOutput>
      <input 
        type="number" 
        value={data.value !== undefined ? data.value : 0} 
        onChange={(e) => updateNodeData(id, { value: parseFloat(e.target.value) || 0 })}
        className="nodrag"
      />
    </NodeWrapper>
  );
};

export const MathNode = ({ id, type }: any) => {
  return (
    <NodeWrapper id={id} title={type} hasInput inputs={['a', 'b']} hasOutput />
  );
};

export const DivideNode = ({ id }: any) => {
  return (
    <NodeWrapper id={id} title="Divide" hasInput inputs={['a', 'b']} hasOutput />
  );
};

export const FormulaNode = ({ id, data }: any) => {
  const updateNodeData = useGraphStore(state => state.updateNodeData);
  return (
    <NodeWrapper id={id} title="Formula" hasInput inputs={['a', 'b']} hasOutput>
      <input 
        type="text" 
        value={data.value || ''} 
        onChange={(e) => updateNodeData(id, { value: e.target.value })}
        placeholder="e.g. a * 2 + b"
        className="nodrag"
      />
    </NodeWrapper>
  );
};

export const DisplayNode = ({ id }: any) => {
  return (
    <NodeWrapper id={id} title="Display" hasInput inputs={['x']} />
  );
};

export const nodeTypes = {
  Number: NumberNode,
  Add: (props: any) => <MathNode {...props} type="Add" />,
  Multiply: (props: any) => <MathNode {...props} type="Multiply" />,
  Divide: DivideNode,
  Formula: FormulaNode,
  Display: DisplayNode
};
