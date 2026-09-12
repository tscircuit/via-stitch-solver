import type { ViaStitchSolverInput } from "../lib"
import input from "../tests/repros/repro-nrf52810-without-copper-pours/solver-input.json"
import { ViaStitchDebugger } from "./ViaStitchDebugger"

export default (
  <ViaStitchDebugger
    title="nRF52810: stricter DRC"
    description="This version requires 0.5 mm trace-to-pad and pad-to-pad clearance. Finish candidate generation, then step through DRC to see the rejected candidate marked with a red cross. Existing routing errors are preserved."
    createInput={() => {
      const stricterInput = structuredClone(input) as ViaStitchSolverInput
      const board = stricterInput.circuitJson.find(
        (element) => element.type === "pcb_board",
      )!
      board.min_trace_to_pad_edge_clearance = 0.5
      board.min_pad_edge_to_pad_edge_clearance = 0.5
      return stricterInput
    }}
  />
)
