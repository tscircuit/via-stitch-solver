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
  /** Eligible pour layers. Defaults to the board stack; all same-net pairs are considered.
   * Physical via spans still cover the full board stack when pcb_board is present. */
  layers?: readonly LayerRef[]
  /** Centre-to-centre spacing of the via grid in millimetres. Defaults to 1 mm. */
  viaStitchPitch?: number
  viaHoleDiameter?: number
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
  layers: readonly LayerRef[]
  viaStitchPitch: number
  viaHoleDiameter: number
  viaOuterDiameter: number
  pourEdgeClearance: number
  obstacleClearance: number
  minimumViaSeparation: number
  gridOrigin: Point
  isTented: boolean
}
