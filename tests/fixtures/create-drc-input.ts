import type { PcbBoard, PcbCopperPourBRep } from "circuit-json"
import type { ViaStitchSolverInput } from "lib/types"

export const createDrcInput = (): ViaStitchSolverInput => {
  const board: PcbBoard = {
    type: "pcb_board",
    pcb_board_id: "board",
    center: { x: 0, y: 0 },
    width: 8,
    height: 8,
    thickness: 1.6,
    material: "fr4",
    num_layers: 2,
  }
  const pours: PcbCopperPourBRep[] = (["top", "bottom"] as const).map(
    (layer) => ({
      type: "pcb_copper_pour",
      pcb_copper_pour_id: `pour_${layer}`,
      source_net_id: "ground",
      layer,
      shape: "brep",
      covered_with_solder_mask: true,
      brep_shape: {
        outer_ring: {
          vertices: [
            { x: -3, y: -3 },
            { x: 3, y: -3 },
            { x: 3, y: 3 },
            { x: -3, y: 3 },
          ],
          edges: [],
        },
        inner_rings: [],
      },
    }),
  )
  return {
    circuitJson: [
      board,
      {
        type: "source_net",
        source_net_id: "ground",
        name: "GND",
        member_source_group_ids: [],
      },
      {
        type: "source_net",
        source_net_id: "signal",
        name: "SIGNAL",
        member_source_group_ids: [],
      },
      ...pours,
    ],
    options: { viaStitchPitch: 2 },
  }
}
