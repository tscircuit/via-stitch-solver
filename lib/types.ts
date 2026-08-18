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
  /** Candidate layout strategy. Grid stitching remains the default. */
  stitchingPattern?: "grid" | "fence"
  /** Centre-to-centre grid spacing or maximum fence spacing in millimetres. */
  viaPitch?: number
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
  /** Nominal fence-via centre offset inward from the copper-pour boundary. */
  fenceInset?: number
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
  stitchingPattern: "grid" | "fence"
  viaPitch: number
  viaHoleDiameter: number
  viaOuterDiameter: number
  pourEdgeClearance: number
  obstacleClearance: number
  minimumViaSeparation: number
  gridOrigin: Point
  fenceInset: number
  isTented: boolean
}
