import { Schema, model } from 'mongoose';

const NodeSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  data: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const EdgeSchema = new Schema({
  id: { type: String, required: true },
  source: { type: String, required: true },
  sourceHandle: { type: String, default: null },
  target: { type: String, required: true },
  targetHandle: { type: String, default: null },
}, { _id: false });

const GraphSchema = new Schema({
  name: { type: String, default: 'Untitled Graph' },
  nodes: [NodeSchema],
  edges: [EdgeSchema],
}, { timestamps: true });

export const Graph = model('Graph', GraphSchema);
