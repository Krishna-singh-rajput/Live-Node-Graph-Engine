import asyncio
import json
import sys
import re

# Add simulation dir to path so we can import
sys.path.append('./simulation')

from app.models import SimulationRequest, Node, Edge
from app.simulator import simulate_graph

# Mock ngspice subprocess
class MockProcess:
    def __init__(self, stdout_data):
        self.stdout_data = stdout_data
        self.returncode = 0

    async def communicate(self):
        return self.stdout_data.encode('utf-8'), b''

    def kill(self):
        pass

# We will intercept the asyncio.create_subprocess_exec
original_exec = asyncio.create_subprocess_exec

async def mock_exec(cmd, *args, **kwargs):
    if cmd == "ngspice":
        # Read the netlist from the tmp file passed as argument
        tmp_file = args[1]
        with open(tmp_file, 'r') as f:
            netlist = f.read()

        print("\n--- [MOCK] GENERATED NETLIST ---")
        print(netlist.strip())
        print("--------------------------------\n")

        # Create a fake output based on what the netlist contains
        # (This is just a mock for visual demonstration)
        # We will parse V... DC <val>
        # and B... V = V(...) + V(...)
        
        vals = {}
        for line in netlist.splitlines():
            line = line.strip()
            if line.startswith('V'):
                # Vnode_id out 0 DC 2.0
                parts = line.split()
                if len(parts) >= 5 and parts[3] == 'DC':
                    vals[parts[1]] = float(parts[4])
            elif line.startswith('B'):
                # Bnode_id out 0 V = V(n1) + V(n2)
                # This is a naive regex just for the mock to evaluate simple math
                match = re.search(r'B.*? (n_[a-zA-Z0-9_]+_out) 0 V = (.+)', line)
                if match:
                    out_net = match.group(1)
                    expr = match.group(2)
                    
                    # Replace V(net) with actual values
                    for net, val in vals.items():
                        expr = expr.replace(f"V({net})", str(val))
                        
                    try:
                        # eval is safe here because we control the mock
                        res = eval(expr)
                        vals[out_net] = res
                    except:
                        pass
        
        # Build mock stdout
        stdout = ""
        for net, val in vals.items():
            stdout += f"v({net}) = {val:e}\n"
            
        return MockProcess(stdout)
    return await original_exec(cmd, *args, **kwargs)

asyncio.create_subprocess_exec = mock_exec

async def run_test():
    # Let's create Acceptance Graph 1: Number 2 and Number 3 -> Add -> Display
    req = SimulationRequest(
        revision=1,
        nodes=[
            Node(id="num1", type="Number", data={"value": 2}),
            Node(id="num2", type="Number", data={"value": 3}),
            Node(id="add1", type="Add", data={}),
            Node(id="disp1", type="Display", data={})
        ],
        edges=[
            Edge(id="e1", source="num1", target="add1", targetHandle="a"),
            Edge(id="e2", source="num2", target="add1", targetHandle="b"),
            Edge(id="e3", source="add1", target="disp1", targetHandle="x")
        ]
    )

    print("Running Simulation for Graph: Number(2) + Number(3) -> Add -> Display")
    response = await simulate_graph(req)
    
    print("--- SIMULATION RESPONSE ---")
    print(json.dumps(response.dict(), indent=2))
    print("---------------------------\n")
    
    
    # Test 2: Formula test
    req2 = SimulationRequest(
        revision=2,
        nodes=[
            Node(id="numA", type="Number", data={"value": 3}),
            Node(id="numB", type="Number", data={"value": 4}),
            Node(id="form1", type="Formula", data={"value": "a * 2 + b"}),
            Node(id="disp2", type="Display", data={})
        ],
        edges=[
            Edge(id="eA", source="numA", target="form1", targetHandle="a"),
            Edge(id="eB", source="numB", target="form1", targetHandle="b"),
            Edge(id="eC", source="form1", target="disp2", targetHandle="x")
        ]
    )

    print("Running Simulation for Graph: Formula (a * 2 + b) with a=3, b=4")
    response2 = await simulate_graph(req2)
    
    print("--- SIMULATION RESPONSE ---")
    print(json.dumps(response2.dict(), indent=2))
    print("---------------------------\n")

if __name__ == "__main__":
    asyncio.run(run_test())
