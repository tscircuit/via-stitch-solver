import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "@tscircuit/copper-pour-solver"
import { BaseSolver } from "@tscircuit/solver-utils"
import type {
  BRepShape,
  PcbBoard,
  PcbCopperPourBRep,
  PcbTrace,
  PcbVia,
  Point,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import { isViaAnnulusInsideShapeUnion } from "../geometry/brep-point-containment"
import { createCorridorOutlines } from "../geometry/corridor-outlines"
import {
  getMaximumWireWidth,
  getTopBottomTransitionCount,
  getTraceCenterline,
  sampleCenterline,
} from "../geometry/trace-centerline"
import type {
  ResolvedViaStitchSolverOptions,
  ViaStitchPcbVia,
  ViaStitchSolverInput,
  ViaStitchSolverOptions,
  ViaStitchSolverOutput,
} from "../types"

interface PowerTraceContext {
  pcbTrace: PcbTrace
  sourceTrace: SourceTrace
  sourceNet: SourceNet
}

const resolveOptions = (
  options: ViaStitchSolverOptions = {},
): ResolvedViaStitchSolverOptions => {
  const resolvedOptions: ResolvedViaStitchSolverOptions = {
    sourceNetIds: options.sourceNetIds
      ? new Set(options.sourceNetIds)
      : undefined,
    pcbTraceIds: options.pcbTraceIds ? new Set(options.pcbTraceIds) : undefined,
    includeGroundNets: options.includeGroundNets ?? false,
    layers: options.layers ?? ["top", "bottom"],
    minimumPourWidth: options.minimumPourWidth ?? 1.4,
    pourPadding: options.pourPadding ?? 0.3,
    padMargin: options.padMargin ?? 0.2,
    traceMargin: options.traceMargin ?? 0.2,
    boardEdgeMargin: options.boardEdgeMargin ?? 0.15,
    cutoutMargin: options.cutoutMargin ?? 0.2,
    viaPitch: options.viaPitch ?? 2,
    viaHoleDiameter: options.viaHoleDiameter ?? 0.3,
    viaOuterDiameter: options.viaOuterDiameter ?? 0.6,
    endpointClearance: options.endpointClearance ?? 0.8,
    minimumViaSeparation:
      options.minimumViaSeparation ??
      Math.max(options.viaOuterDiameter ?? 0.6, 0.8),
    coveredWithSolderMask: options.coveredWithSolderMask ?? true,
  }

  for (const [optionName, optionValue] of [
    ["minimumPourWidth", resolvedOptions.minimumPourWidth],
    ["viaPitch", resolvedOptions.viaPitch],
    ["viaHoleDiameter", resolvedOptions.viaHoleDiameter],
    ["viaOuterDiameter", resolvedOptions.viaOuterDiameter],
    ["minimumViaSeparation", resolvedOptions.minimumViaSeparation],
  ] as const) {
    if (!Number.isFinite(optionValue) || optionValue <= 0) {
      throw new Error(`${optionName} must be a finite number greater than zero`)
    }
  }
  for (const [optionName, optionValue] of [
    ["pourPadding", resolvedOptions.pourPadding],
    ["padMargin", resolvedOptions.padMargin],
    ["traceMargin", resolvedOptions.traceMargin],
    ["boardEdgeMargin", resolvedOptions.boardEdgeMargin],
    ["cutoutMargin", resolvedOptions.cutoutMargin],
    ["endpointClearance", resolvedOptions.endpointClearance],
  ] as const) {
    if (!Number.isFinite(optionValue) || optionValue < 0) {
      throw new Error(`${optionName} must be a finite non-negative number`)
    }
  }
  if (resolvedOptions.viaHoleDiameter >= resolvedOptions.viaOuterDiameter) {
    throw new Error("viaHoleDiameter must be smaller than viaOuterDiameter")
  }
  if (String(resolvedOptions.layers[0]) === String(resolvedOptions.layers[1])) {
    throw new Error("layers must contain two distinct PCB layers")
  }

  return resolvedOptions
}

const getPowerTraceContexts = (
  input: ViaStitchSolverInput,
  options: ResolvedViaStitchSolverOptions,
): PowerTraceContext[] => {
  const sourceNetsById = new Map(
    input.circuitJson
      .filter((element): element is SourceNet => element.type === "source_net")
      .map((sourceNet) => [sourceNet.source_net_id, sourceNet]),
  )
  const sourceTracesById = new Map(
    input.circuitJson
      .filter(
        (element): element is SourceTrace => element.type === "source_trace",
      )
      .map((sourceTrace) => [sourceTrace.source_trace_id, sourceTrace]),
  )
  const powerTraceContexts: PowerTraceContext[] = []

  for (const element of input.circuitJson) {
    if (element.type !== "pcb_trace") continue
    const pcbTrace = element as PcbTrace
    if (
      options.pcbTraceIds &&
      !options.pcbTraceIds.has(pcbTrace.pcb_trace_id)
    ) {
      continue
    }
    if (!pcbTrace.source_trace_id) continue

    const sourceTrace = sourceTracesById.get(pcbTrace.source_trace_id)
    if (!sourceTrace) continue
    const sourceNet = sourceTrace.connected_source_net_ids
      .map((sourceNetId) => sourceNetsById.get(sourceNetId))
      .find(
        (candidate): candidate is SourceNet =>
          candidate !== undefined &&
          (options.sourceNetIds
            ? options.sourceNetIds.has(candidate.source_net_id)
            : candidate.is_power === true ||
              (options.includeGroundNets && candidate.is_ground === true)),
      )
    if (!sourceNet) continue
    if (getTraceCenterline(pcbTrace).length < 2) continue

    powerTraceContexts.push({ pcbTrace, sourceTrace, sourceNet })
  }

  return powerTraceContexts
}

const isTooCloseToAnyPoint = ({
  point,
  otherPoints,
  minimumDistance,
}: {
  point: Point
  otherPoints: Point[]
  minimumDistance: number
}) =>
  otherPoints.some(
    (otherPoint) =>
      Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) <
      minimumDistance,
  )

export class ViaStitchSolver extends BaseSolver {
  private readonly options: ResolvedViaStitchSolverOptions
  private readonly powerTraceContexts: PowerTraceContext[]
  private readonly pcbBoard: PcbBoard
  private readonly pcbCopperPours: PcbCopperPourBRep[] = []
  private readonly pcbVias: ViaStitchPcbVia[] = []
  private readonly occupiedViaCenters: Point[] = []
  private nextPowerTraceIndex = 0
  private detectedLayerTransitionCount = 0
  private nextCopperPourId = 0
  private nextViaId = 0

  constructor(private readonly input: ViaStitchSolverInput) {
    super()
    this.options = resolveOptions(input.options)
    this.powerTraceContexts = getPowerTraceContexts(input, this.options)
    const pcbBoard = input.circuitJson.find(
      (element): element is PcbBoard => element.type === "pcb_board",
    )
    if (!pcbBoard) throw new Error("ViaStitchSolver requires a pcb_board")
    this.pcbBoard = pcbBoard

    for (const element of input.circuitJson) {
      if (element.type === "pcb_via") {
        const pcbVia = element as PcbVia
        this.occupiedViaCenters.push({ x: pcbVia.x, y: pcbVia.y })
      } else if (element.type === "pcb_trace") {
        for (const routePoint of (element as PcbTrace).route) {
          if (routePoint.route_type === "via") {
            this.occupiedViaCenters.push({
              x: routePoint.x,
              y: routePoint.y,
            })
          }
        }
      }
    }
  }

  override _step(): void {
    const powerTraceContext = this.powerTraceContexts[this.nextPowerTraceIndex]
    if (!powerTraceContext) {
      this.solved = true
      this.progress = 1
      return
    }

    this.processPowerTrace(powerTraceContext)
    this.nextPowerTraceIndex += 1
    this.progress =
      this.powerTraceContexts.length === 0
        ? 1
        : this.nextPowerTraceIndex / this.powerTraceContexts.length
    this.solved = this.nextPowerTraceIndex === this.powerTraceContexts.length
  }

  private processPowerTrace(context: PowerTraceContext): void {
    const { pcbTrace, sourceNet, sourceTrace } = context
    const centerline = getTraceCenterline(pcbTrace)
    const corridorWidth = Math.max(
      this.options.minimumPourWidth,
      getMaximumWireWidth(pcbTrace) + this.options.pourPadding * 2,
    )
    const corridorOutlines = createCorridorOutlines({
      centerline,
      width: corridorWidth,
      pcbBoard: this.pcbBoard,
      boardEdgeMargin: this.options.boardEdgeMargin,
    })
    const brepShapesByLayer = new Map<string, BRepShape[]>()

    for (const layer of this.options.layers) {
      const layerBrepShapes: BRepShape[] = []
      for (const outline of corridorOutlines) {
        const inputProblem = convertCircuitJsonToInputProblem(
          this.input.circuitJson,
          {
            layer,
            source_net_id: sourceNet.source_net_id,
            subcircuit_id: sourceNet.subcircuit_id,
            pad_margin: this.options.padMargin,
            trace_margin: this.options.traceMargin,
            board_edge_margin: this.options.boardEdgeMargin,
            cutout_margin: this.options.cutoutMargin,
            outline,
          },
        )
        const output = new CopperPourPipelineSolver(inputProblem).getOutput()
        layerBrepShapes.push(...output.brep_shapes)
      }
      brepShapesByLayer.set(String(layer), layerBrepShapes)

      for (const brepShape of layerBrepShapes) {
        this.pcbCopperPours.push({
          type: "pcb_copper_pour",
          shape: "brep",
          pcb_copper_pour_id: `via_stitch_copper_pour_${this.nextCopperPourId++}`,
          layer,
          source_net_id: sourceNet.source_net_id,
          subcircuit_id: pcbTrace.subcircuit_id,
          pcb_group_id: pcbTrace.pcb_group_id,
          covered_with_solder_mask: this.options.coveredWithSolderMask,
          brep_shape: brepShape,
        })
      }
    }

    this.detectedLayerTransitionCount += getTopBottomTransitionCount(pcbTrace)
    this.addStitchingVias({
      context,
      centerline,
      brepShapesByLayer,
    })
  }

  private addStitchingVias({
    context,
    centerline,
    brepShapesByLayer,
  }: {
    context: PowerTraceContext
    centerline: Point[]
    brepShapesByLayer: Map<string, BRepShape[]>
  }): void {
    const { pcbTrace, sourceNet, sourceTrace } = context
    const candidateCenters = sampleCenterline({
      centerline,
      pitch: this.options.viaPitch,
      endpointClearance: this.options.endpointClearance,
    })
    const viaRadius = this.options.viaOuterDiameter / 2
    const [fromLayer, toLayer] = this.options.layers
    const fromLayerShapes = brepShapesByLayer.get(String(fromLayer)) ?? []
    const toLayerShapes = brepShapesByLayer.get(String(toLayer)) ?? []

    for (const center of candidateCenters) {
      if (
        isTooCloseToAnyPoint({
          point: center,
          otherPoints: this.occupiedViaCenters,
          minimumDistance: this.options.minimumViaSeparation,
        }) ||
        !isViaAnnulusInsideShapeUnion({
          center,
          radius: viaRadius,
          shapes: fromLayerShapes,
        }) ||
        !isViaAnnulusInsideShapeUnion({
          center,
          radius: viaRadius,
          shapes: toLayerShapes,
        })
      ) {
        continue
      }

      const pcbVia = {
        type: "pcb_via",
        pcb_via_id: `via_stitch_via_${this.nextViaId++}`,
        x: center.x,
        y: center.y,
        hole_diameter: this.options.viaHoleDiameter,
        outer_diameter: this.options.viaOuterDiameter,
        layers: [fromLayer, toLayer],
        from_layer: fromLayer,
        to_layer: toLayer,
        pcb_trace_id: pcbTrace.pcb_trace_id,
        source_trace_id: sourceTrace.source_trace_id,
        source_net_id: sourceNet.source_net_id,
        subcircuit_id: pcbTrace.subcircuit_id,
        pcb_group_id: pcbTrace.pcb_group_id,
        subcircuit_connectivity_map_key:
          sourceTrace.subcircuit_connectivity_map_key ??
          sourceNet.subcircuit_connectivity_map_key,
        is_tented: true,
      } as ViaStitchPcbVia
      this.pcbVias.push(pcbVia)
      this.occupiedViaCenters.push(center)
    }
  }

  override getOutput(): ViaStitchSolverOutput {
    return {
      processedPowerTraceCount: this.powerTraceContexts.length,
      detectedLayerTransitionCount: this.detectedLayerTransitionCount,
      pcbCopperPours: this.pcbCopperPours,
      pcbVias: this.pcbVias,
    }
  }
}
