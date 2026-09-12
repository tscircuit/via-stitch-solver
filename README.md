# @tscircuit/via-stitch-solver

Adds standard via stitching between existing same-net copper pours on two PCB
layers.

The solver does not create or reshape copper pours. It:

1. Finds BRep copper pours connected to the same source net on both requested
   layers.
2. Builds a deterministic via grid over their shared bounds.
3. Keeps a candidate only when the complete via annulus and requested edge
   clearance fit inside copper on both layers.
4. Avoids component bounds, pads, plated holes, board holes, existing routing
   vias, explicit vias, and newly-created stitching vias.
5. Runs a final `drc` phase using `@tscircuit/checks` to reject generated vias
   that violate via-to-pad, via-to-trace, same/different-net via spacing,
   board-outline clearance, or copper keepout rules.
6. Emits only validated `pcb_via` elements connected to the stitched net.

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
    viaStitchPitch: 1,
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

`viaStitchPitch` is the positive, finite centre-to-centre grid spacing in
millimetres, matching the parsed board prop in core. It defaults to `1` when
omitted. Unit strings such as `"1mm"` should be parsed by the caller before
passing the numeric value to the solver. `viaStitchPitch` is the only supported
pitch option.

The DRC phase uses the board's configured clearances (or the checks package's
manufacturing defaults). These rules still apply when the geometric clearance
options are smaller. If a pair of generated vias violates spacing, both are
rejected. The solver finishes only after validation, and `getOutput().pcbVias`
remains empty until then.

Existing input vias, traces, and errors are preserved. This solver prevents DRC
violations from newly generated stitching vias; it does not repair pre-existing
routing errors. See the nRF52810 regression in
`tests/repros/repro-nrf52810-without-copper-pours` for an example that already has
three routed-via clearance errors before stitching.
