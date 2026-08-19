# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper on two PCB layers.
It supports overlapping copper pours and post-autoroute power or GND traces
entering an explicit same-net polygon pour on the opposite layer.

Run the solver after autorouting and copper-pour generation. It reads the final
PCB trace routes and BRep polygon pours from Circuit JSON; it does not route
traces or create or reshape pours.

The solver:

1. Finds explicit BRep copper pours connected to the same source net on both
   requested layers and builds a deterministic via grid in their overlap.
2. Finds routed power/GND traces that enter an explicit same-net pour on the
   opposite layer and adds at most one via at each eligible trace entry.
3. Keeps a candidate only when the complete via annulus and requested edge
   clearance fit inside copper on both layers.
4. Avoids component bounds, pads, plated holes, board holes, existing routing
   vias, explicit vias, and newly-created stitching vias.
5. Emits `pcb_via` elements connected to the stitched net.

This covers the usual copper-pour stitching operations used for top and bottom
GND planes and for connecting an entering power/GND trace to a same-net plane
on the other layer. The solver never creates an implicit pour on a layer where
one does not exist: a routed trace supplies copper only on its routed layer,
and the other layer must contain an explicit pour. Pours can cover the board or
use fixed convex/concave polygon outlines.

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
    pourEdgeClearance: 0.2,
    obstacleClearance: 0.2,
  },
})

solver.solve()
const { pcbVias } = solver.getOutput()
const stitchedCircuitJson = [...circuitJson, ...pcbVias]
```

By default the grid is aligned to board-world `(0, 0)`. Set `gridOrigin` when a
different grid alignment is needed. When via dimensions are omitted, the
solver uses `pcb_board.min_via_hole_diameter` and
`pcb_board.min_via_pad_diameter`. It falls back to 0.2 mm and 0.3 mm only when
the board does not provide those values. Generated vias are tented by default.

## Post-autoroute traces entering polygon pours

When a power or GND trace crosses from outside into the board-space outline of
an explicit same-net polygon pour on the opposite layer, the solver tests the
first feasible point inside the pour. It adds at most one entry via for that
trace and never continues placing vias along the routed corridor. The complete
via annulus plus `pourEdgeClearance` must fit inside the trace copper on the
routed layer and inside the explicit pour on the opposite layer. Traces
connected to a different net are never used as stitch guides.

The example in `examples/power-polygon-entry-stitching.tsx` uses a small VCC
polygon around only the VCC pads of two capacitors. The autorouter carries a
thick VCC trace from the connector into that local pour. The example in
`examples/ground-pour-trace-entry-stitching.tsx` mirrors that arrangement for
two GND pads and a thick entering GND trace. Both examples keep their signal
pads outside the pour, use only an explicit bottom-layer pour, receive one
entry via per eligible trace, and never add a via row along the trace corridor.

The combined example in `examples/dual-net-pour-entry-stitching.tsx` places a
compact explicit bottom-layer VCC polygon and a separate compact explicit
bottom-layer GND polygon on the same board. Each polygon follows two target
pads and adds only a short arm around its incoming trace. The autorouter takes
one thick top-layer trace of each net into its matching bottom pour, and the
solver emits one independently net-labeled entry via for each trace.
