import { BaseSolver } from "@tscircuit/solver-utils"
import type {
  BRepShape,
  PcbCopperPourBRep,
  PcbTrace,
  PcbVia,
  Point,
  SourceNet,
} from "circuit-json"
import {
  getShapeUnionBounds,
  isViaAnnulusInsideShapeUnion,
} from "../geometry/brep-point-containment"
import {
  doesViaIntersectStitchingObstacle,
  getStitchingObstacles,
} from "../geometry/circuit-element-obstacles"
import { getFenceCandidateCenters } from "../geometry/get-fence-candidate-centers"
import type {
  ResolvedViaStitchSolverOptions,
  ViaStitchPcbVia,
  ViaStitchSolverInput,
  ViaStitchSolverOptions,
  ViaStitchSolverOutput,
} from "../types"

interface CopperPourPairContext {
  sourceNetId: SourceNet["source_net_id"]
  sourceNet?: SourceNet
  fromLayerPours: PcbCopperPourBRep[]
  toLayerPours: PcbCopperPourBRep[]
}

interface OccupiedVia {
  center: Point
  radius: number
}

const resolveOptions = (
  options: ViaStitchSolverOptions = {},
): ResolvedViaStitchSolverOptions => {
  const viaOuterDiameter = options.viaOuterDiameter ?? 0.6
  const pourEdgeClearance = options.pourEdgeClearance ?? 0.2
  const obstacleClearance = options.obstacleClearance ?? 0.2
  const resolvedOptions: ResolvedViaStitchSolverOptions = {
    sourceNetIds: options.sourceNetIds
      ? new Set(options.sourceNetIds)
      : undefined,
    layers: options.layers ?? ["top", "bottom"],
    stitchingPattern: options.stitchingPattern ?? "grid",
    viaPitch: options.viaPitch ?? 2,
    viaHoleDiameter: options.viaHoleDiameter ?? 0.3,
    viaOuterDiameter,
    pourEdgeClearance,
    obstacleClearance,
    minimumViaSeparation:
      options.minimumViaSeparation ??
      Math.max(options.viaOuterDiameter ?? 0.6, 0.8),
    gridOrigin: options.gridOrigin ?? { x: 0, y: 0 },
    fenceTraceIds: options.fenceTraceIds
      ? new Set(options.fenceTraceIds)
      : undefined,
    fenceTraceOffset:
      options.fenceTraceOffset ??
      viaOuterDiameter / 2 + obstacleClearance + pourEdgeClearance,
    isTented: options.isTented ?? true,
  }

  for (const [optionName, optionValue] of [
    ["viaPitch", resolvedOptions.viaPitch],
    ["viaHoleDiameter", resolvedOptions.viaHoleDiameter],
    ["viaOuterDiameter", resolvedOptions.viaOuterDiameter],
    ["minimumViaSeparation", resolvedOptions.minimumViaSeparation],
  ] as const) {
    if (!Number.isFinite(optionValue) || optionValue <= 0) {
      throw new Error(`${optionName} must be a finite number greater than zero`)
    }
  }
  if (
    !Number.isFinite(resolvedOptions.pourEdgeClearance) ||
    resolvedOptions.pourEdgeClearance < 0
  ) {
    throw new Error("pourEdgeClearance must be a finite non-negative number")
  }
  if (
    !Number.isFinite(resolvedOptions.obstacleClearance) ||
    resolvedOptions.obstacleClearance < 0
  ) {
    throw new Error("obstacleClearance must be a finite non-negative number")
  }
  if (
    !Number.isFinite(resolvedOptions.fenceTraceOffset) ||
    resolvedOptions.fenceTraceOffset < 0
  ) {
    throw new Error("fenceTraceOffset must be a finite non-negative number")
  }
  if (
    resolvedOptions.stitchingPattern !== "grid" &&
    resolvedOptions.stitchingPattern !== "fence"
  ) {
    throw new Error('stitchingPattern must be either "grid" or "fence"')
  }
  if (
    !Number.isFinite(resolvedOptions.gridOrigin.x) ||
    !Number.isFinite(resolvedOptions.gridOrigin.y)
  ) {
    throw new Error("gridOrigin coordinates must be finite numbers")
  }
  if (resolvedOptions.viaHoleDiameter >= resolvedOptions.viaOuterDiameter) {
    throw new Error("viaHoleDiameter must be smaller than viaOuterDiameter")
  }
  if (String(resolvedOptions.layers[0]) === String(resolvedOptions.layers[1])) {
    throw new Error("layers must contain two distinct PCB layers")
  }

  return resolvedOptions
}

const isBrepCopperPour = (
  element: ViaStitchSolverInput["circuitJson"][number],
): element is PcbCopperPourBRep =>
  element.type === "pcb_copper_pour" && element.shape === "brep"

const getCopperPourPairContexts = (
  input: ViaStitchSolverInput,
  options: ResolvedViaStitchSolverOptions,
): CopperPourPairContext[] => {
  const sourceNetsById = new Map(
    input.circuitJson
      .filter((element): element is SourceNet => element.type === "source_net")
      .map((sourceNet) => [sourceNet.source_net_id, sourceNet]),
  )
  const poursBySourceNetId = new Map<
    SourceNet["source_net_id"],
    PcbCopperPourBRep[]
  >()

  for (const element of input.circuitJson) {
    if (!isBrepCopperPour(element) || !element.source_net_id) continue
    if (
      options.sourceNetIds &&
      !options.sourceNetIds.has(element.source_net_id)
    ) {
      continue
    }
    const sourceNetPours = poursBySourceNetId.get(element.source_net_id) ?? []
    sourceNetPours.push(element)
    poursBySourceNetId.set(element.source_net_id, sourceNetPours)
  }

  const [fromLayer, toLayer] = options.layers
  const contexts: CopperPourPairContext[] = []
  for (const [sourceNetId, sourceNetPours] of poursBySourceNetId) {
    const fromLayerPours = sourceNetPours.filter(
      (copperPour) => String(copperPour.layer) === String(fromLayer),
    )
    const toLayerPours = sourceNetPours.filter(
      (copperPour) => String(copperPour.layer) === String(toLayer),
    )
    if (fromLayerPours.length === 0 || toLayerPours.length === 0) continue
    contexts.push({
      sourceNetId,
      sourceNet: sourceNetsById.get(sourceNetId),
      fromLayerPours,
      toLayerPours,
    })
  }

  return contexts
}

const getPcbTraceViaRadius = (
  routePoint: Extract<PcbTrace["route"][number], { route_type: "via" }>,
  fallbackRadius: number,
) => {
  const routePointWithDiameter = routePoint as typeof routePoint & {
    outer_diameter?: number
  }
  return (routePointWithDiameter.outer_diameter ?? fallbackRadius * 2) / 2
}

const isTooCloseToOccupiedVia = ({
  center,
  radius,
  occupiedVias,
  minimumViaSeparation,
}: {
  center: Point
  radius: number
  occupiedVias: OccupiedVia[]
  minimumViaSeparation: number
}) =>
  occupiedVias.some(
    (occupiedVia) =>
      Math.hypot(
        center.x - occupiedVia.center.x,
        center.y - occupiedVia.center.y,
      ) < Math.max(minimumViaSeparation, radius + occupiedVia.radius),
  )

const getGridCoordinates = ({
  minimum,
  maximum,
  origin,
  pitch,
}: {
  minimum: number
  maximum: number
  origin: number
  pitch: number
}) => {
  const coordinates: number[] = []
  const firstGridIndex = Math.ceil((minimum - origin) / pitch)
  const lastGridIndex = Math.floor((maximum - origin) / pitch)
  for (
    let gridIndex = firstGridIndex;
    gridIndex <= lastGridIndex;
    gridIndex++
  ) {
    coordinates.push(origin + gridIndex * pitch)
  }
  return coordinates
}

const getGridCandidateCenters = ({
  fromLayerShapes,
  toLayerShapes,
  requiredCopperRadius,
  gridOrigin,
  viaPitch,
}: {
  fromLayerShapes: BRepShape[]
  toLayerShapes: BRepShape[]
  requiredCopperRadius: number
  gridOrigin: Point
  viaPitch: number
}) => {
  const fromBounds = getShapeUnionBounds(fromLayerShapes)
  const toBounds = getShapeUnionBounds(toLayerShapes)
  if (!fromBounds || !toBounds) return []

  const overlapBounds = {
    minX: Math.max(fromBounds.minX, toBounds.minX),
    maxX: Math.min(fromBounds.maxX, toBounds.maxX),
    minY: Math.max(fromBounds.minY, toBounds.minY),
    maxY: Math.min(fromBounds.maxY, toBounds.maxY),
  }
  if (
    overlapBounds.minX > overlapBounds.maxX ||
    overlapBounds.minY > overlapBounds.maxY
  ) {
    return []
  }

  const xCoordinates = getGridCoordinates({
    minimum: overlapBounds.minX + requiredCopperRadius,
    maximum: overlapBounds.maxX - requiredCopperRadius,
    origin: gridOrigin.x,
    pitch: viaPitch,
  })
  const yCoordinates = getGridCoordinates({
    minimum: overlapBounds.minY + requiredCopperRadius,
    maximum: overlapBounds.maxY - requiredCopperRadius,
    origin: gridOrigin.y,
    pitch: viaPitch,
  })

  return yCoordinates.flatMap((y) => xCoordinates.map((x) => ({ x, y })))
}

export class ViaStitchSolver extends BaseSolver {
  private readonly options: ResolvedViaStitchSolverOptions
  private readonly copperPourPairContexts: CopperPourPairContext[]
  private readonly pcbVias: ViaStitchPcbVia[] = []
  private readonly pcbTraces: PcbTrace[]
  private readonly occupiedVias: OccupiedVia[] = []
  private readonly existingPcbViaIds = new Set<string>()
  private readonly stitchingObstacles
  private nextCopperPourPairIndex = 0
  private nextViaId = 0

  constructor(private readonly input: ViaStitchSolverInput) {
    super()
    this.options = resolveOptions(input.options)
    this.copperPourPairContexts = getCopperPourPairContexts(input, this.options)
    this.stitchingObstacles = getStitchingObstacles(
      input.circuitJson,
      this.options.layers,
    )
    this.pcbTraces = input.circuitJson.filter(
      (element): element is PcbTrace => element.type === "pcb_trace",
    )
    if (this.options.fenceTraceIds) {
      const availableTraceIds = new Set(
        this.pcbTraces.map((pcbTrace) => pcbTrace.pcb_trace_id),
      )
      const missingTraceIds = [...this.options.fenceTraceIds].filter(
        (pcbTraceId) => !availableTraceIds.has(pcbTraceId),
      )
      if (missingTraceIds.length > 0) {
        throw new Error(
          `fenceTraceIds contains unknown PCB trace IDs: ${missingTraceIds.join(", ")}`,
        )
      }
    }
    const fallbackViaRadius = this.options.viaOuterDiameter / 2

    for (const element of input.circuitJson) {
      if (element.type === "pcb_via") {
        const pcbVia = element as PcbVia
        this.existingPcbViaIds.add(pcbVia.pcb_via_id)
        this.occupiedVias.push({
          center: { x: pcbVia.x, y: pcbVia.y },
          radius: pcbVia.outer_diameter / 2,
        })
      } else if (element.type === "pcb_trace") {
        for (const routePoint of (element as PcbTrace).route) {
          if (routePoint.route_type !== "via") continue
          this.occupiedVias.push({
            center: { x: routePoint.x, y: routePoint.y },
            radius: getPcbTraceViaRadius(routePoint, fallbackViaRadius),
          })
        }
      }
    }
  }

  override _step(): void {
    const copperPourPairContext =
      this.copperPourPairContexts[this.nextCopperPourPairIndex]
    if (!copperPourPairContext) {
      this.solved = true
      this.progress = 1
      return
    }

    this.processCopperPourPair(copperPourPairContext)
    this.nextCopperPourPairIndex += 1
    this.progress =
      this.copperPourPairContexts.length === 0
        ? 1
        : this.nextCopperPourPairIndex / this.copperPourPairContexts.length
    this.solved =
      this.nextCopperPourPairIndex === this.copperPourPairContexts.length
  }

  private processCopperPourPair(context: CopperPourPairContext): void {
    const [fromLayer, toLayer] = this.options.layers
    const fromLayerShapes = context.fromLayerPours.map(
      (copperPour) => copperPour.brep_shape,
    )
    const toLayerShapes = context.toLayerPours.map(
      (copperPour) => copperPour.brep_shape,
    )
    const viaRadius = this.options.viaOuterDiameter / 2
    const requiredCopperRadius = viaRadius + this.options.pourEdgeClearance
    const requiredObstacleRadius = viaRadius + this.options.obstacleClearance
    const fenceReferenceTraces = this.options.fenceTraceIds
      ? this.pcbTraces.filter((pcbTrace) =>
          this.options.fenceTraceIds!.has(pcbTrace.pcb_trace_id),
        )
      : this.pcbTraces
    const candidateCenters =
      this.options.stitchingPattern === "fence"
        ? getFenceCandidateCenters({
            pcbTraces: fenceReferenceTraces,
            layers: this.options.layers,
            pitch: this.options.viaPitch,
            traceOffset: this.options.fenceTraceOffset,
          })
        : getGridCandidateCenters({
            fromLayerShapes,
            toLayerShapes,
            requiredCopperRadius,
            gridOrigin: this.options.gridOrigin,
            viaPitch: this.options.viaPitch,
          })

    for (const center of candidateCenters) {
      if (
        isTooCloseToOccupiedVia({
          center,
          radius: viaRadius,
          occupiedVias: this.occupiedVias,
          minimumViaSeparation: this.options.minimumViaSeparation,
        }) ||
        doesViaIntersectStitchingObstacle({
          center,
          radius: requiredObstacleRadius,
          obstacles: this.stitchingObstacles,
        }) ||
        !isViaAnnulusInsideShapeUnion({
          center,
          radius: requiredCopperRadius,
          shapes: fromLayerShapes,
        }) ||
        !isViaAnnulusInsideShapeUnion({
          center,
          radius: requiredCopperRadius,
          shapes: toLayerShapes,
        })
      ) {
        continue
      }

      let pcbViaId = `via_stitch_via_${this.nextViaId++}`
      while (this.existingPcbViaIds.has(pcbViaId)) {
        pcbViaId = `via_stitch_via_${this.nextViaId++}`
      }
      const referencePour = context.fromLayerPours[0]!
      const pcbVia = {
        type: "pcb_via",
        pcb_via_id: pcbViaId,
        x: center.x,
        y: center.y,
        hole_diameter: this.options.viaHoleDiameter,
        outer_diameter: this.options.viaOuterDiameter,
        layers: [fromLayer, toLayer],
        from_layer: fromLayer,
        to_layer: toLayer,
        source_net_id: context.sourceNetId,
        subcircuit_id: referencePour.subcircuit_id,
        pcb_group_id: referencePour.pcb_group_id,
        subcircuit_connectivity_map_key:
          context.sourceNet?.subcircuit_connectivity_map_key,
        is_tented: this.options.isTented,
      } as ViaStitchPcbVia
      this.pcbVias.push(pcbVia)
      this.existingPcbViaIds.add(pcbViaId)
      this.occupiedVias.push({ center, radius: viaRadius })
    }
  }

  override getOutput(): ViaStitchSolverOutput {
    return {
      processedCopperPourPairCount: this.copperPourPairContexts.length,
      pcbVias: this.pcbVias,
    }
  }
}
