# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper on two PCB layers.
It supports overlapping copper pours and post-autoroute power or GND traces
entering a same-net polygon pour on the other layer.

Run the solver after autorouting and copper-pour generation. It reads the final
PCB trace routes and BRep polygon pours from Circuit JSON; it does not route
traces or create or reshape pours.

The solver:

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

## Post-autoroute traces entering polygon pours

When a routed trace on one requested layer overlaps a same-net copper pour on
the other layer, the solver samples along the final autorouted trace. The
opposite-layer polygon pour must contain the complete via annulus plus
`pourEdgeClearance`. On the trace layer, that required copper can be supplied by
the union of the trace and a same-net pour. This allows a narrow GND branch to
enter a GND pour and receive a via even when the via annulus is wider than the
trace by itself. Traces connected to a different net are never used as stitch
guides.

The example in
`examples/power-trace-copper-pour-stitching.tsx` uses a 1.2 mm top-layer VCC
trace over a fixed bottom-layer VCC pour. The generated vias follow only the
part of the route that overlaps the pour; they do not fill the rest of the pour.

The example in `examples/ground-pour-trace-entry-stitching.tsx` models the
common layout where narrow GND branches enter a fixed top/bottom GND polygon
while signal and power routes cut clearance channels through it. The GND via
grid stays inside the remaining overlap, and route-aligned vias are kept out of
foreign-net trace channels and component pads.
