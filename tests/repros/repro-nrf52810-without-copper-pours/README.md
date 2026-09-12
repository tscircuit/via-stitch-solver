# nRF52810 via stitching regression

`solver-input.json` was captured from the `solver:started` event for
`ViaStitchSolver` while running core's
`tests/repros/repro-nrf52810-without-copper-pours/repro-nrf52810-without-copper-pours.test.tsx`
at commit `e65fd9873e98b702273ce6b9a1e547cd1d8bb989` from
https://github.com/tscircuit/core/pull/3792.

It contains the original source connectivity, PCB geometry, and solver options.
Schematic/CAD elements, drawing annotations, courtyards, and stored diagnostics
are omitted. Geometry and routing have not been changed. Capturing the solver
input makes this regression independent of future autorouter changes.

The original board already has three via-to-pad clearance errors at BT1, C1,
and L2 **before** stitching. The first test verifies the exact same errors
remain after stitching, with no new via clearance errors and no input mutation.

The second test raises the board's trace-to-pad and pad-to-pad clearances to
0.5 mm. Before the DRC phase was added, this produced a new error for
`via_stitch_via_0` against `source_net_4_mst0_0`: 0.440077 mm clearance where
0.5 mm is required. The final DRC phase removes that candidate while retaining
valid stitching vias. Existing routing violations remain visible.
