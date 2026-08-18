# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper on two PCB layers.
It supports overlapping copper pours and a thick routed power trace overlapping
a copper pour on the other layer.

The solver does not create or reshape copper pours. It:

1. Finds either two overlapping BRep copper pours, or a routed trace and BRep
   pour connected to the same source net on opposite layers.
2. Builds a deterministic via grid, route-following power-via row, or trace-edge
   via fence as appropriate.
3. Keeps a candidate only when the complete via annulus and requested edge
   clearance fit inside copper on both layers.
4. Avoids component bounds, pads, plated holes, board holes, existing routing
   vias, explicit vias, and newly-created stitching vias.
5. Emits `pcb_via` elements connected to the stitched net.

This is the usual copper-pour stitching operation used for top and bottom GND
planes and for wide power routing over a same-net plane. Pours can cover the
board or use fixed convex/concave polygon outlines; vias are emitted only inside
the actual shared copper area.

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

## Power trace over a copper pour

When a thick trace on one requested layer overlaps a same-net copper pour on the
other layer, the default grid mode samples along the routed trace. A candidate
is emitted only if the complete via annulus plus `pourEdgeClearance` fits inside
both the trace copper and the BRep pour. Thin traces that cannot contain the via
are ignored, as are traces connected to a different net.

The example in
`examples/power-trace-copper-pour-stitching.tsx` uses a 1.2 mm top-layer VCC
trace over a fixed bottom-layer VCC pour. The generated vias follow only the
part of the route that overlaps the pour; they do not fill the rest of the pour.

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
