from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class Node(BaseModel):
    id: str
    type: str
    data: Dict[str, Any]

class Edge(BaseModel):
    id: str
    source: str
    sourceHandle: Optional[str] = None
    target: str
    targetHandle: Optional[str] = None

class SimulationRequest(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    revision: int = 0

class SimulationResponse(BaseModel):
    revision: int
    results: Dict[str, Any]  # Node ID -> Value
    errors: Dict[str, str]   # Node ID -> Error Message
    blocked: List[str]       # Node IDs that are blocked due to upstream errors
