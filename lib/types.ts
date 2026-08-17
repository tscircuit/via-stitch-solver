import type {
  AnyCircuitElement,
  LayerRef,
  PcbCopperPourBRep,
  PcbTrace,
  PcbVia,
  SourceNet,
  SourceTrace,
} from "circuit-json"

export interface ViaStitchSolverOptions {
  /** Process only these source nets. By default every `is_power` net is used. */
  sourceNetIds?: Array<SourceNet["source_net_id"]>
  /** Process only these routed traces. Primarily useful for focused tooling/tests. */
  pcbTraceIds?: Array<PcbTrace["pcb_trace_id"]>
  /** Include nets marked as ground in addition to nets marked as power. */
  includeGroundNets?: boolean
  /** Layers receiving the overlapping corridor pours and stitching vias. */
  layers?: readonly [LayerRef, LayerRef]
  /** Minimum final corridor width in millimetres. Defaults to 1.4 mm. */
  minimumPourWidth?: number
  /** Copper added on each side of the widest routed wire. Defaults to 0.3 mm. */
  pourPadding?: number
  /** Clearance from unrelated pads/plated holes in millimetres. */
  padMargin?: number
  /** Clearance from unrelated routed copper in millimetres. */
  traceMargin?: number
  /** Clearance from board edges in millimetres. */
  boardEdgeMargin?: number
  /** Clearance from board cutouts in millimetres. */
  cutoutMargin?: number
  /** Desired centre-to-centre pitch of stitching vias in millimetres. */
  viaPitch?: number
  viaHoleDiameter?: number
  viaOuterDiameter?: number
  /** Distance omitted at each routed endpoint so vias do not land on pads. */
  endpointClearance?: number
  /** Minimum centre distance from existing or newly-created vias. */
  minimumViaSeparation?: number
  /** Ordinary power copper is solder-mask covered by default. */
  coveredWithSolderMask?: boolean
}

export interface ViaStitchSolverInput {
  circuitJson: AnyCircuitElement[]
  options?: ViaStitchSolverOptions
}

export type ViaStitchPcbVia = PcbVia & {
  source_trace_id?: SourceTrace["source_trace_id"]
  source_net_id?: SourceNet["source_net_id"]
}

export interface ViaStitchSolverOutput {
  processedPowerTraceCount: number
  detectedLayerTransitionCount: number
  pcbCopperPours: PcbCopperPourBRep[]
  pcbVias: ViaStitchPcbVia[]
}

export interface ResolvedViaStitchSolverOptions {
  sourceNetIds?: Set<SourceNet["source_net_id"]>
  pcbTraceIds?: Set<PcbTrace["pcb_trace_id"]>
  includeGroundNets: boolean
  layers: readonly [LayerRef, LayerRef]
  minimumPourWidth: number
  pourPadding: number
  padMargin: number
  traceMargin: number
  boardEdgeMargin: number
  cutoutMargin: number
  viaPitch: number
  viaHoleDiameter: number
  viaOuterDiameter: number
  endpointClearance: number
  minimumViaSeparation: number
  coveredWithSolderMask: boolean
}
