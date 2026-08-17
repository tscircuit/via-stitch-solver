# @tscircuit/via-stitch-solver

Generates clearance-aware, overlapping copper corridors on two PCB layers and
adds stitching vias along the complete routed path of Circuit JSON power
traces.

Unlike a transition-only approach, this solver reinforces the full power route:

1. Find routed traces connected to `source_net` elements marked `is_power`.
2. Simplify each route centerline and union it into a round-ended corridor.
3. Clip the corridor to the board outline and requested edge margin.
4. Use `@tscircuit/copper-pour-solver` to clear unrelated pads, traces, vias,
   holes, and cutouts independently on both layers.
5. Place vias at a configurable pitch only where the complete via annulus fits
   inside both final copper pours.
6. Reuse existing routing vias by keeping new stitching vias away from them.

## Install

```bash
bun add @tscircuit/via-stitch-solver
```

To test an unpublished GitHub branch:

```bash
bun add github:tscircuit/via-stitch-solver#agent/add-full-route-via-stitching
```

## Usage

```ts
import {
  initializeViaStitchSolver,
  ViaStitchSolver,
} from "@tscircuit/via-stitch-solver"

await initializeViaStitchSolver()

const solver = new ViaStitchSolver({
  circuitJson,
  options: {
    minimumPourWidth: 1.4,
    pourPadding: 0.3,
    viaPitch: 2,
    viaHoleDiameter: 0.3,
    viaOuterDiameter: 0.6,
    padMargin: 0.2,
    traceMargin: 0.2,
  },
})

solver.solve()
const { pcbCopperPours, pcbVias } = solver.getOutput()
const reinforcedCircuitJson = [
  ...circuitJson,
  ...pcbCopperPours,
  ...pcbVias,
]
```

The default layers are `top` and `bottom`. Copper is covered with solder mask
unless `coveredWithSolderMask: false` is explicitly requested.

## Example circuits

The repository includes five post-processed tscircuit examples copied from the
core integration fixture. Each uses 0.8 mm power traces, three or four passive
components, and a different chip footprint:

- SOIC-8 with 3 passives
- SOIC-16 with 4 passives
- QFP-16 with 3 passives
- QFN-32 with 4 passives
- TSSOP-20 with 3 passives

Their committed PCB SVG snapshots show the complete routed VCC corridors poured
on the top and bottom layers with stitching vias distributed along the route.
The circuit definitions are in
[`examples/via-stitching-power-circuits.tsx`](examples/via-stitching-power-circuits.tsx).

## Design scope

This solver is intended for ordinary DC power rails. High-dv/dt switching nodes
should not be marked for automatic full-route pouring without reviewing the
resulting loop area and parasitic capacitance. Via dimensions, pitch, and copper
width must be chosen for the board fabricator, copper weight, current,
temperature rise, and reliability requirements.

## Development

```bash
bun install
bun run format
bun run typecheck
bun run build
bun test
bun start
```
