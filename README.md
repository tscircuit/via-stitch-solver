# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper on two PCB layers.
It supports overlapping copper pours and a thick routed power trace overlapping
a copper pour on the other layer.

The solver does not create or reshape copper pours. It:

1. Finds BRep copper pours connected to the same source net on both requested
   layers, or a routed power/GND trace and polygon pour connected to the same
   source net on opposite layers.
2. Builds a deterministic via grid or route-following stitching-via row.
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
