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

## Step-by-step visual debugger

Run `bun install` and `bun start`, then open the Cosmos URL printed in the
terminal. This uses React Cosmos and `GenericSolverDebugger`, matching
`implicit-copper-pour-solver`.

Choose a fixture from the sidebar:

- **solver**: small board showing trace-clearance and keepout rejections.
- **nrf52810**: the original captured regression board.
- **nrf52810-strict-drc**: the same board with 0.5 mm board clearances, showing
  the candidate removed by DRC.

**Step** advances one grid point once candidate generation starts. The pipeline
stage table exposes **Next Stage**, stage progress, timings, and counts. Use
**Animate** or **Solve** to advance faster, **Reset example** to replay, and the
input/visualization download menus to save a reproduction. Enable object
interaction to see hover labels and use the layer dropdown for top (`z0`) and
bottom (`z1`). Copper boundaries include the inner rings so voids stay visible.

Amber circles are candidates, a cyan ring marks the current grid point, green
circles passed DRC, and red crosses mark rejected candidates. Red crosses are
visual diagnostics only and are never included in `getOutput().pcbVias`.

The public solver exposes the standard `BasePipelineSolver` interface, including
`visualize()`, `getConstructorParams()`, and `solveUntilStage("drc")`. Constructor
validation and final output geometry are unchanged. Candidate generation now
advances incrementally, so iteration counts differ from older releases.

Build the static Cosmos site with `bun run build:site`; the existing Vercel
configuration publishes `cosmos-export`.
