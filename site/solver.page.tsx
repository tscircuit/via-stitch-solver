import type { PcbBoard } from "circuit-json"
import { createDrcInput } from "../tests/fixtures/create-drc-input"
import { ViaStitchDebugger } from "./ViaStitchDebugger"

export default (
  <ViaStitchDebugger
    title="Via stitching: step-by-step demo"
    description="Follow the grid across two GND pours, then run DRC to remove candidates near the signal trace or inside the keepout. Candidate geometry and final DRC are separate stages in the table below."
    createInput={() => {
      const input = createDrcInput()
      const board = input.circuitJson[0] as PcbBoard
      board.min_trace_to_pad_edge_clearance = 0.5
      input.circuitJson.push(
        {
          type: "source_trace",
          source_trace_id: "signal_trace",
          connected_source_net_ids: ["signal"],
          connected_source_port_ids: [],
        },
        {
          type: "pcb_trace",
          pcb_trace_id: "signal_trace",
          source_trace_id: "signal_trace",
          route: [
            { route_type: "wire", x: -3, y: 0.6, width: 0.2, layer: "top" },
            { route_type: "wire", x: 3, y: 0.6, width: 0.2, layer: "top" },
          ],
        },
        {
          type: "pcb_keepout",
          pcb_keepout_id: "stitching_keepout",
          shape: "rect",
          center: { x: 2, y: 2 },
          width: 1,
          height: 1,
          layers: ["top", "bottom"],
        },
      )
      return input
    }}
  />
)
