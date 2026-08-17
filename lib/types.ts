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
  /** Layers whose same-net copper overlap should be stitched. */
  layers?: readonly [LayerRef, LayerRef]
  /** Centre-to-centre spacing of the via grid in millimetres. */
  viaPitch?: number
  viaHoleDiameter?: number
  viaOuterDiameter?: number
  /** Copper required beyond the via annulus on both stitched layers. */
  pourEdgeClearance?: number
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
  minimumViaSeparation: number
  gridOrigin: Point
  isTented: boolean
}
