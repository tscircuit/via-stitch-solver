import type { ViaStitchSolverInput } from "../lib"
import input from "../tests/repros/repro-nrf52810-without-copper-pours/solver-input.json"
import { ViaStitchDebugger } from "./ViaStitchDebugger"

export default (
  <ViaStitchDebugger
    title="nRF52810: original board"
    description="Inspect the actual input captured before stitching in core PR #3792. Existing routed vias are grey; newly generated vias turn green after DRC. The three pre-existing BT1/C1/L2 routing errors remain outside this solver's scope."
    createInput={() => structuredClone(input) as ViaStitchSolverInput}
  />
)
