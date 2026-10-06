import { Router } from 'express';
import { Graph } from './models/Graph';
import axios from 'axios';

const router = Router();
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

// Save Graph
router.post('/graphs', async (req, res) => {
  try {
    const { nodes, edges, name } = req.body;
    const graph = new Graph({ nodes, edges, name });
    await graph.save();
    res.json({ id: graph._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save graph' });
  }
});

// Load Graph
router.get('/graphs/:id', async (req, res) => {
  try {
    const graph = await Graph.findById(req.params.id);
    if (!graph) return res.status(404).json({ error: 'Graph not found' });
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load graph' });
  }
});

// Simulate via Python backend
router.post('/simulate', async (req, res) => {
  try {
    const { nodes, edges, revision } = req.body;
    
    // Call Python simulation service
    const response = await axios.post(`${PYTHON_SERVICE_URL}/simulate`, {
      nodes,
      edges,
      revision
    }, { timeout: 10000 });
    
    res.json(response.data);
  } catch (err: any) {
    console.error('Simulation error:', err.message);
    if (err.code === 'ECONNABORTED') {
      return res.status(503).json({ error: 'Simulation timeout', revision: req.body.revision });
    }
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    res.status(503).json({ error: 'Simulation service unavailable', revision: req.body.revision });
  }
});

export default router;
