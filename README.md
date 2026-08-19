# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper on two PCB layers.
It supports overlapping copper pours and post-autoroute power or GND traces
entering same-net polygon pours on both selected layers.

Run the solver after autorouting and copper-pour generation. It reads the final
PCB trace routes and BRep polygon pours from Circuit JSON; it does not route
traces or create or reshape pours.

The solver:

1. Finds BRep copper pours connected to the same source net on both requested
   layers, then finds routed power/GND traces crossing into those pours.
2. Builds a deterministic via grid and adds at most one extra via where each
   eligible trace enters the paired polygon pours.
3. Keeps a candidate only when the complete via annulus and requested edge
   clearance fit inside copper on both layers.
4. Avoids component bounds, pads, plated holes, board holes, existing routing
   vias, explicit vias, and newly-created stitching vias.
5. Emits `pcb_via` elements connected to the stitched net.

This is the usual copper-pour stitching operation used for top and bottom GND
planes and for connecting an entering power/GND trace to a same-net plane on
the other layer. Pours can cover the board or use fixed convex/concave polygon
outlines; vias are emitted only inside the actual shared copper area.

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

## Post-autoroute traces entering polygon pours

When a power or GND trace crosses from outside into a same-net polygon pour,
and that net also has a polygon pour on the other selected layer, the solver
tests the first feasible point inside the pour. It adds at most one entry via
for that trace and never continues placing vias along the routed corridor. The
complete via annulus plus `pourEdgeClearance` must fit in copper on both layers.
On the trace layer, that copper can come from the union of the trace and its
same-net pour. Traces connected to a different net are never used as stitch
guides.

The example in `examples/power-polygon-entry-stitching.tsx` uses a VCC trace
that the autorouter takes into fixed top/bottom VCC polygons. It receives one
entry via in addition to the regular pour grid; there is no row of vias along
the power-trace corridor.

The example in `examples/ground-pour-trace-entry-stitching.tsx` models the
common layout where the autorouter joins outside GND pads and carries one GND
connection into a fixed top/bottom GND polygon while signal and power routes
cut clearance channels through it. The GND via grid stays inside the remaining
overlap, and the entry via is kept out of foreign-net trace channels and
component pads.
