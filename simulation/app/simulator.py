import asyncio
import tempfile
import subprocess
import os
import re
import ast
from collections import defaultdict, deque
from app.models import SimulationRequest, SimulationResponse

def is_safe_formula(expr: str) -> bool:
    if not expr.strip():
        return False
    # Basic character check
    if not re.match(r'^[0-9a-bA-B\+\-\*\/\(\)\s\.]+$', expr):
        return False
    try:
        tree = ast.parse(expr, mode='eval')
        for node in ast.walk(tree):
            if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.operator, ast.unaryop, ast.Name, ast.Load, ast.Constant)):
                return False
            if isinstance(node, ast.Name) and node.id not in ('a', 'b'):
                return False
        return True
    except Exception:
        return False

async def simulate_graph(req: SimulationRequest) -> SimulationResponse:
    nodes = {n.id: n for n in req.nodes}
    edges = req.edges

    results = {}
    errors = {}
    blocked = set()

    # Build adjacency
    incoming = {n_id: {} for n_id in nodes} # node_id -> {handle: source_node_id}
    outgoing = {n_id: [] for n_id in nodes} # node_id -> [target_node_id]

    for e in edges:
        if e.target in incoming:
            incoming[e.target][e.targetHandle] = e.source
        if e.source in outgoing:
            outgoing[e.source].append(e.target)

    # 1. Cycle detection (Kahn's algorithm)
    in_degree = {n: 0 for n in nodes}
    for e in edges:
        if e.target in in_degree:
            in_degree[e.target] += 1
            
    queue = deque([n for n, deg in in_degree.items() if deg == 0])
    visited_count = 0
    while queue:
        u = queue.popleft()
        visited_count += 1
        for v in outgoing[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
                
    if visited_count != len(nodes):
        # Cycle detected
        cycle_nodes = [n for n, deg in in_degree.items() if deg > 0]
        for n in cycle_nodes:
            errors[n] = "Cycle detected"
            
    # 2. Check for missing inputs and invalid values
    for n_id, node in nodes.items():
        if n_id in errors: continue
        
        if node.type == 'Add' or node.type == 'Multiply' or node.type == 'Divide' or node.type == 'Formula':
            if 'a' not in incoming[n_id] or 'b' not in incoming[n_id]:
                errors[n_id] = "Missing input wire(s)"
        elif node.type == 'Display':
            if 'x' not in incoming[n_id] and 'in' not in incoming[n_id] and not incoming[n_id]:
                 errors[n_id] = "Missing input"
        elif node.type == 'Number':
            val = node.data.get('value')
            try:
                float(val)
            except (ValueError, TypeError):
                errors[n_id] = "Invalid number"
        
        if node.type == 'Formula':
            expr = node.data.get('value', '')
            if not is_safe_formula(expr):
                errors[n_id] = "Invalid or unsafe formula"

        # Divide by zero static check
        if node.type == 'Divide' and 'b' in incoming[n_id]:
            b_src = incoming[n_id]['b']
            if nodes[b_src].type == 'Number':
                b_val = nodes[b_src].data.get('value')
                try:
                    if float(b_val) == 0:
                        errors[n_id] = "Divide by zero"
                except:
                    pass

    # Propagate blocked status
    def propagate_block(start_node):
        q = deque([start_node])
        while q:
            curr = q.popleft()
            for tgt in outgoing[curr]:
                if tgt not in blocked and tgt not in errors:
                    blocked.add(tgt)
                    q.append(tgt)

    for err_node in list(errors.keys()):
        propagate_block(err_node)

    # If any error, we might skip ngspice for blocked nodes, but we still generate netlist for valid ones
    # Actually, we should only generate netlist for nodes that are NOT in errors and NOT in blocked
    valid_nodes = set(nodes.keys()) - set(errors.keys()) - blocked

    netlist = []
    # ngspice identifiers shouldn't have dashes
    def safe_id(nid):
        return nid.replace('-', '_')

    for n_id in valid_nodes:
        node = nodes[n_id]
        sid = safe_id(n_id)
        out_net = f"n_{sid}_out"
        
        if node.type == 'Number':
            val = node.data.get('value', 0)
            netlist.append(f"V{sid} {out_net} 0 DC {val}")
        elif node.type == 'Add':
            a_src = safe_id(incoming[n_id]['a'])
            b_src = safe_id(incoming[n_id]['b'])
            netlist.append(f"B{sid} {out_net} 0 V = V(n_{a_src}_out) + V(n_{b_src}_out)")
        elif node.type == 'Multiply':
            a_src = safe_id(incoming[n_id]['a'])
            b_src = safe_id(incoming[n_id]['b'])
            netlist.append(f"B{sid} {out_net} 0 V = V(n_{a_src}_out) * V(n_{b_src}_out)")
        elif node.type == 'Divide':
            a_src = safe_id(incoming[n_id]['a'])
            b_src = safe_id(incoming[n_id]['b'])
            netlist.append(f"B{sid} {out_net} 0 V = V(n_{a_src}_out) / V(n_{b_src}_out)")
        elif node.type == 'Formula':
            a_src = safe_id(incoming[n_id]['a'])
            b_src = safe_id(incoming[n_id]['b'])
            expr = node.data.get('value', '')
            # Replace 'a' and 'b' with their net references
            # Use regex to replace whole words 'a' and 'b'
            expr = re.sub(r'\ba\b', f"V(n_{a_src}_out)", expr)
            expr = re.sub(r'\bb\b', f"V(n_{b_src}_out)", expr)
            netlist.append(f"B{sid} {out_net} 0 V = {expr}")
        # Display has no netlist line

    if valid_nodes and netlist:
        netlist.insert(0, "* RapidChip Generated Netlist")
        netlist.append(".op")
        netlist.append(".print op V(all)") # Ensure we print all voltages
        netlist.append(".end")

        netlist_str = "\n".join(netlist) + "\n"

        # Run ngspice
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.cir') as tmp:
            tmp.write(netlist_str)
            tmp_path = tmp.name

        try:
            # Run ngspice in batch mode
            process = await asyncio.create_subprocess_exec(
                "ngspice", "-b", tmp_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=5.0)
                stdout_str = stdout.decode('utf-8')
                
                if process.returncode != 0:
                    # Generic failure if ngspice fails, but we try to continue
                    pass
                
                # Parse output
                # Output looks like:
                # n_id_out = 1.000000e+01
                # or V(n_id_out) = ...
                for line in stdout_str.splitlines():
                    match = re.search(r'v\(n_([a-zA-Z0-9_]+)_out\)\s*=\s*([+-]?\d+\.?\d*[eE]?[+-]?\d*)', line, re.IGNORECASE)
                    if not match:
                        match = re.search(r'n_([a-zA-Z0-9_]+)_out\s*=\s*([+-]?\d+\.?\d*[eE]?[+-]?\d*)', line, re.IGNORECASE)
                    if match:
                        nid_safe = match.group(1)
                        val = float(match.group(2))
                        # Find original id
                        orig_id = next((k for k in valid_nodes if safe_id(k) == nid_safe), None)
                        if orig_id:
                            results[orig_id] = val

            except asyncio.TimeoutError:
                process.kill()
                for n in valid_nodes:
                    errors[n] = "Simulation timeout"
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    # For display nodes, extract value from their input source
    for n_id in valid_nodes:
        if nodes[n_id].type == 'Display':
            src = None
            if 'x' in incoming[n_id]: src = incoming[n_id]['x']
            elif 'in' in incoming[n_id]: src = incoming[n_id]['in']
            else:
                 # fallback if handle is generic
                 src_keys = list(incoming[n_id].keys())
                 if src_keys: src = incoming[n_id][src_keys[0]]

            if src and src in results:
                results[n_id] = results[src]

    return SimulationResponse(
        revision=req.revision,
        results=results,
        errors=errors,
        blocked=list(blocked)
    )
