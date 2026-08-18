# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper pours on two PCB
layers.

The solver does not create or reshape copper pours. It:

1. Finds BRep copper pours connected to the same source net on both requested
   layers.
2. Builds either a deterministic via grid or a trace-edge via fence.
3. Keeps a candidate only when the complete via annulus and requested edge
   clearance fit inside copper on both layers.
4. Avoids component bounds, pads, plated holes, board holes, existing routing
   vias, explicit vias, and newly-created stitching vias.
5. Emits `pcb_via` elements connected to the stitched net.

This is the usual copper-pour stitching operation used for top and bottom GND
planes. The pours can cover the board or use fixed convex/concave polygon
outlines; vias are emitted only inside their actual overlapping copper. It also
works for any other net that already has overlapping pours.

## Install

```bash
bun add @tscircuit/via-stitch-solver
```

## Usage

```ts
import { ViaStitchSolver } from "@tscircuit/via-stitch-solver"

const solver = new ViaStitchSolver({
  circuitJson,
  options: {
    layers: ["top", "bottom"],
    stitchingPattern: "grid",
    viaPitch: 2,
    viaHoleDiameter: 0.3,
    viaOuterDiameter: 0.6,
    pourEdgeClearance: 0.2,
    obstacleClearance: 0.2,
  },
})

solver.solve()
const { pcbVias } = solver.getOutput()
const stitchedCircuitJson = [...circuitJson, ...pcbVias]
```

By default the grid is aligned to board-world `(0, 0)`. Set `gridOrigin` when a
different grid alignment is needed. Generated vias are tented by default.

## Fence stitching

Set `stitchingPattern: "fence"` to place two rows of stitching vias beside
routed traces instead of filling the copper-pour interior with a grid. The rows
follow both trace edges and continue around bends. Layer transitions split the
guide into per-layer runs, and existing route vias remain protected by the
normal via-separation check.

`sourceNetIds` selects the copper-pour net assigned to the new vias (usually
GND). `fenceTraceIds` independently selects the routed traces whose edges guide
placement; when omitted, all PCB traces are considered. This means the guide
trace can be a signal while the fence vias correctly remain GND vias.

`viaPitch` is the maximum spacing along each row. `fenceTraceOffset` is the
additional via-centre distance outward from the trace copper edge. Its default
accounts for the via radius, `obstacleClearance`, and `pourEdgeClearance`.

```ts
const fenceSolver = new ViaStitchSolver({
  circuitJson,
  options: {
    sourceNetIds: [groundSourceNetId],
    stitchingPattern: "fence",
    fenceTraceIds: [signalPcbTraceId],
    viaPitch: 2,
    fenceTraceOffset: 0.8,
  },
})
```

Fence candidates must still fit completely inside the same-net copper on both
layers and pass all component, pad, hole, and existing-via clearance checks.
Candidates that land in the trace's copper-pour clearance channel are therefore
discarded rather than being forced into invalid copper.
