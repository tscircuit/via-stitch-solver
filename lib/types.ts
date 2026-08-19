import type {
  AnyCircuitElement,
  LayerRef,
  PcbVia,
  Point,
  SourceNet,
} from "circuit-json"

export interface ViaStitchSolverOptions {
  /** Process only copper pours connected to these source nets. */
  sourceNetIds?: Array<SourceNet["source_net_id"]>
  /** Layers whose explicit pours or trace-to-pour copper should be stitched. */
  layers?: readonly [LayerRef, LayerRef]
  /** Centre-to-centre spacing of the via grid in millimetres. */
  viaPitch?: number
  /** Override pcb_board.min_via_hole_diameter. */
  viaHoleDiameter?: number
  /** Override pcb_board.min_via_pad_diameter. */
  viaOuterDiameter?: number
  /** Copper required beyond the via annulus on both stitched layers. */
  pourEdgeClearance?: number
  /** Clearance from component bounds, pads, plated holes, and board holes. */
  obstacleClearance?: number
  /** Minimum centre distance from existing or newly-created vias. */
  minimumViaSeparation?: number
  /** Board-world origin used to align the via grid. */
  gridOrigin?: Point
  /** Whether generated stitching vias are tented. */
  isTented?: boolean
}

export interface ViaStitchSolverInput {
  circuitJson: AnyCircuitElement[]
  options?: ViaStitchSolverOptions
}

export type ViaStitchPcbVia = PcbVia & {
  source_net_id: SourceNet["source_net_id"]
}

export interface ViaStitchSolverOutput {
  processedCopperPourPairCount: number
  pcbVias: ViaStitchPcbVia[]
}

export interface ResolvedViaStitchSolverOptions {
  sourceNetIds?: Set<SourceNet["source_net_id"]>
  layers: readonly [LayerRef, LayerRef]
  viaPitch: number
  viaHoleDiameter: number
  viaOuterDiameter: number
  pourEdgeClearance: number
  obstacleClearance: number
  minimumViaSeparation: number
  gridOrigin: Point
  isTented: boolean
}
