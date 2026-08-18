# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper pours on two PCB
layers.

The solver does not create or reshape copper pours. It:

1. Finds BRep copper pours connected to the same source net on both requested
   layers.
2. Builds either a deterministic via grid or a perimeter-following via fence.
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

Set `stitchingPattern: "fence"` to place vias around the outer boundary of each
overlapping copper-pour island instead of filling its interior with a grid.
`viaPitch` is the maximum spacing along the fence. `fenceInset` controls the
nominal distance from the copper boundary to each via centre and defaults to
the via radius plus `pourEdgeClearance`.

```ts
const fenceSolver = new ViaStitchSolver({
  circuitJson,
  options: {
    stitchingPattern: "fence",
    viaPitch: 2,
    fenceInset: 0.5,
  },
})
```

Fence candidates must still fit completely inside the same-net copper on both
layers and pass all component, pad, hole, and existing-via clearance checks.
