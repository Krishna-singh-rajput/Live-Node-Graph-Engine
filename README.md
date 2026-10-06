# RapidChip Live Node Graph Engine

A browser-based live circuit simulator that parses visual node graphs into ngspice netlists, executes them in the backend, and synchronizes the frontend canvas in real time.

## How to Run

Requirements: Docker, Docker Compose

```bash
docker compose up --build
```

Then visit [http://localhost:3000](http://localhost:3000)

## Architecture

```text
┌──────────────────┐
│   React + RF     │
│   Node Editor    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Node.js Express  │
│      API         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Python FastAPI   │
│ Simulation       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│     ngspice      │
└──────────────────┘

        MongoDB
           ▲
           │
      Node.js API
```

1. **Frontend (React/Vite/Zustand)**: Manages graph state, node interactions, and UI updates. Throttles requests via debouncing.
2. **Backend API (Node.js/Express)**: Orchestrates requests to Python backend, handles graph persistence in MongoDB.
3. **Simulation Service (Python/FastAPI)**: Validates graph logic, securely parses Formula nodes, generates dynamic ngspice netlists, and executes `ngspice -b`.

## Graph to Netlist & Loop Detection

### Loop Detection
Before generating the netlist, Kahn's Algorithm for topological sorting is applied. If the algorithm cannot process all nodes (the in-degree doesn't drop to 0 for all nodes), a cycle is present. The remaining nodes with `in-degree > 0` are flagged with a "Cycle detected" error, and their downstream descendants are marked as blocked.

### Netlist Generation
The simulation backend walks the valid, acyclic nodes:
- Each node maps to a specific ngspice identifier (`n_<node_id>_out`).
- `Number` maps to DC voltage sources (`V...`).
- Math operators map to Behavioral (non-linear) sources (`B...`).
- We emit `.op` to print all node voltages via `.print op V(all)`.
- The outputs from `ngspice` are parsed, mapping standard variables like `v(n_xyz_out)` back to the specific node ID.

## Step 5 Answers

- **Fast edits:** Handled by a debounced (200ms) execution loop using Axios and `AbortController`. Each simulation request includes a monotonically increasing `revision` number. The frontend simply ignores HTTP responses where `revision !== currentRevision`, preventing stale results from overriding new data.
- **Errors on the right node:** Validation checks for cycles, missing inputs, and explicit divide-by-zero are done statically *before* invoking `ngspice`. Errors are placed securely in an `errors` map. A Breadth-First-Search (BFS) marks all descendants of erroneous nodes as "blocked".
- **ngspice misbehaves:** If `ngspice` hangs, the `asyncio.wait_for` function enforcing a 5-second timeout will forcibly kill the process and return a timeout error map. If the Python API crashes, Axios traps the HTTP error, and the UI shifts its connection badge state to "Error" without crashing the frontend.
- **Untrusted formulas:** The expression is validated natively via Python's built-in `ast` module. The AST walker checks the parse tree to confirm the string exclusively contains simple operators (`ast.BinOp`, etc.) and acceptable names (`a`, `b`). Any file I/O calls, system execution, string injections, or malformed characters cause an immediate parsing fault, halting validation.

## Known Limitations
- A highly complex graph with hundreds of elements may cause visual clutter, as auto-layout / intelligent wire routing logic has not been implemented.

## What I'd Do Next
- **Auto-Routing and Layouting:** Implement ELK.js or Dagre for automatic canvas organization.
- **Additional Nodes:** Subtraction, Exponentiation, and Logic Gates (AND, OR, NOT).
- **Transient Analysis:** Allow `.tran` simulations to plot wave graphs over time.
- **E2E Testing:** Playwright automation for verifying exact DOM interaction flows.

## AI Usage
AI tooling was used throughout development to scaffold project structures (Docker Compose, `package.json`, React skeletons), formulate the Kahn's algorithm for loop detection efficiently, structure the AST validation algorithm securely for the Formula Node, and style the application with premium vanilla CSS visuals.
