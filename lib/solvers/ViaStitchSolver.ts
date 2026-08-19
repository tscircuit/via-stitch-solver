import { BaseSolver } from "@tscircuit/solver-utils"
import type {
  BRepShape,
  LayerRef,
  PcbBoard,
  PcbCopperPourBRep,
  PcbTrace,
  PcbTraceRoutePointWire,
  PcbVia,
  Point,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import {
  getShapeUnionBounds,
  isPointInShapeUnion,
  isViaAnnulusInsideShapeUnion,
} from "../geometry/brep-point-containment"
import {
  doesViaIntersectStitchingObstacle,
  getStitchingObstacles,
} from "../geometry/circuit-element-obstacles"
import {
  getTraceCopperCandidateCenters,
  isViaAnnulusInsideTraceCopper,
} from "../geometry/trace-copper"
import type {
  ResolvedViaStitchSolverOptions,
  ViaStitchPcbVia,
  ViaStitchSolverInput,
  ViaStitchSolverOutput,
} from "../types"

interface CopperPourPairContext {
  sourceNetId: SourceNet["source_net_id"]
  sourceNet?: SourceNet
  fromLayerPours: PcbCopperPourBRep[]
  toLayerPours: PcbCopperPourBRep[]
}

interface TraceCopperPourContext {
  sourceNetId: SourceNet["source_net_id"]
  sourceNet?: SourceNet
  traceLayer: LayerRef
  pcbTraces: PcbTrace[]
  explicitPours: PcbCopperPourBRep[]
}

interface OccupiedVia {
  center: Point
  radius: number
}

const DEFAULT_LAYERS = ["top", "bottom"] as const

const resolveOptions = ({
  circuitJson,
  options = {},
}: ViaStitchSolverInput): ResolvedViaStitchSolverOptions => {
  const pcbBoard = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  const viaHoleDiameter =
    options.viaHoleDiameter ?? pcbBoard?.min_via_hole_diameter ?? 0.2
  const viaOuterDiameter =
    options.viaOuterDiameter ?? pcbBoard?.min_via_pad_diameter ?? 0.3
  const resolvedOptions: ResolvedViaStitchSolverOptions = {
    sourceNetIds: options.sourceNetIds
      ? new Set(options.sourceNetIds)
      : undefined,
    layers: options.layers ?? DEFAULT_LAYERS,
    viaPitch: options.viaPitch ?? 2,
    viaHoleDiameter,
    viaOuterDiameter,
    pourEdgeClearance: options.pourEdgeClearance ?? 0.2,
    obstacleClearance: options.obstacleClearance ?? 0.2,
    minimumViaSeparation:
      options.minimumViaSeparation ?? Math.max(viaOuterDiameter, 0.8),
    gridOrigin: options.gridOrigin ?? { x: 0, y: 0 },
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

const getSourceNetIdsForPcbTrace = ({
  pcbTrace,
  sourceTracesById,
  sourceNetsByConnectivityKey,
  sourceNetsById,
}: {
  pcbTrace: PcbTrace
  sourceTracesById: Map<SourceTrace["source_trace_id"], SourceTrace>
  sourceNetsByConnectivityKey: Map<string, SourceNet>
  sourceNetsById: Map<SourceNet["source_net_id"], SourceNet>
}) => {
  const sourceTrace = pcbTrace.source_trace_id
    ? sourceTracesById.get(pcbTrace.source_trace_id)
    : undefined
  const sourceNetIds = new Set<SourceNet["source_net_id"]>(
    sourceTrace?.connected_source_net_ids ?? [],
  )

  if (sourceTrace?.subcircuit_connectivity_map_key) {
    const sourceNet = sourceNetsByConnectivityKey.get(
      sourceTrace.subcircuit_connectivity_map_key,
    )
    if (sourceNet) sourceNetIds.add(sourceNet.source_net_id)
  }

  const connectionName = (pcbTrace as PcbTrace & { connection_name?: string })
    .connection_name
  if (connectionName && sourceNetsById.has(connectionName)) {
    sourceNetIds.add(connectionName)
  }

  return [...sourceNetIds]
}

const getTraceCopperPourContexts = (
  input: ViaStitchSolverInput,
  options: ResolvedViaStitchSolverOptions,
): TraceCopperPourContext[] => {
  const sourceNets = input.circuitJson.filter(
    (element): element is SourceNet => element.type === "source_net",
  )
  const sourceNetsById = new Map(
    sourceNets.map((sourceNet) => [sourceNet.source_net_id, sourceNet]),
  )
  const sourceNetsByConnectivityKey = new Map(
    sourceNets.flatMap((sourceNet) =>
      sourceNet.subcircuit_connectivity_map_key
        ? [[sourceNet.subcircuit_connectivity_map_key, sourceNet] as const]
        : [],
    ),
  )
  const sourceTracesById = new Map(
    input.circuitJson
      .filter(
        (element): element is SourceTrace => element.type === "source_trace",
      )
      .map((sourceTrace) => [sourceTrace.source_trace_id, sourceTrace]),
  )
  const poursBySourceNetId = new Map<
    SourceNet["source_net_id"],
    PcbCopperPourBRep[]
  >()
  const tracesBySourceNetId = new Map<SourceNet["source_net_id"], PcbTrace[]>()

  for (const element of input.circuitJson) {
    if (isBrepCopperPour(element) && element.source_net_id) {
      if (
        options.sourceNetIds &&
        !options.sourceNetIds.has(element.source_net_id)
      ) {
        continue
      }
      const sourceNetPours = poursBySourceNetId.get(element.source_net_id) ?? []
      sourceNetPours.push(element)
      poursBySourceNetId.set(element.source_net_id, sourceNetPours)
      continue
    }

    if (element.type !== "pcb_trace") continue
    for (const sourceNetId of getSourceNetIdsForPcbTrace({
      pcbTrace: element,
      sourceTracesById,
      sourceNetsByConnectivityKey,
      sourceNetsById,
    })) {
      if (options.sourceNetIds && !options.sourceNetIds.has(sourceNetId)) {
        continue
      }
      const sourceNetTraces = tracesBySourceNetId.get(sourceNetId) ?? []
      sourceNetTraces.push(element)
      tracesBySourceNetId.set(sourceNetId, sourceNetTraces)
    }
  }

  const contexts: TraceCopperPourContext[] = []
  const [fromLayer, toLayer] = options.layers
  for (const [sourceNetId, pcbTraces] of tracesBySourceNetId) {
    const sourceNet = sourceNetsById.get(sourceNetId)
    if (!sourceNet?.is_power && !sourceNet?.is_ground) continue

    const copperPours = poursBySourceNetId.get(sourceNetId) ?? []
    for (const [traceLayer, pourLayer] of [
      [fromLayer, toLayer],
      [toLayer, fromLayer],
    ] as const) {
      const explicitPours = copperPours.filter(
        (copperPour) => String(copperPour.layer) === String(pourLayer),
      )
      const explicitPourShapes = explicitPours.map(
        (copperPour) => copperPour.brep_shape,
      )
      const explicitPourBounds = getShapeUnionBounds(explicitPourShapes)
      const layerTraces = pcbTraces.filter((pcbTrace) => {
        const layerWirePoints = pcbTrace.route.filter(
          (routePoint): routePoint is PcbTraceRoutePointWire =>
            routePoint.route_type === "wire" &&
            String(routePoint.layer) === String(traceLayer),
        )
        if (layerWirePoints.length === 0) return false

        // Trace copper exists only on the layer where the trace is routed.
        // Stitch it to an explicit same-net pour on the opposite layer when
        // the routed trace crosses into that pour's board-space outline.
        return (
          explicitPourBounds !== undefined &&
          layerWirePoints.some((routePoint) =>
            isPointInShapeUnion(routePoint, explicitPourShapes),
          ) &&
          layerWirePoints.some(
            (routePoint) =>
              routePoint.x < explicitPourBounds.minX ||
              routePoint.x > explicitPourBounds.maxX ||
              routePoint.y < explicitPourBounds.minY ||
              routePoint.y > explicitPourBounds.maxY,
          )
        )
      })
      if (layerTraces.length === 0 || explicitPours.length === 0) continue

      contexts.push({
        sourceNetId,
        sourceNet,
        traceLayer,
        pcbTraces: layerTraces,
        explicitPours,
      })
    }
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

export class ViaStitchSolver extends BaseSolver {
  private readonly options: ResolvedViaStitchSolverOptions
  private readonly copperPourPairContexts: CopperPourPairContext[]
  private readonly traceCopperPourContexts: TraceCopperPourContext[]
  private readonly pcbVias: ViaStitchPcbVia[] = []
  private readonly occupiedVias: OccupiedVia[] = []
  private readonly existingPcbViaIds = new Set<string>()
  private readonly stitchingObstacles
  private nextContextIndex = 0
  private nextViaId = 0

  constructor(private readonly input: ViaStitchSolverInput) {
    super()
    this.options = resolveOptions(input)
    this.copperPourPairContexts = getCopperPourPairContexts(input, this.options)
    this.traceCopperPourContexts = getTraceCopperPourContexts(
      input,
      this.options,
    )
    this.stitchingObstacles = getStitchingObstacles(
      input.circuitJson,
      this.options.layers,
    )
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
    const contexts = [
      ...this.copperPourPairContexts.map((context) => ({
        kind: "pour-pair" as const,
        context,
      })),
      ...this.traceCopperPourContexts.map((context) => ({
        kind: "trace-pour" as const,
        context,
      })),
    ]
    const workItem = contexts[this.nextContextIndex]
    if (!workItem) {
      this.solved = true
      this.progress = 1
      return
    }

    if (workItem.kind === "pour-pair") {
      this.processCopperPourPair(workItem.context)
    } else {
      this.processTraceCopperPour(workItem.context)
    }
    this.nextContextIndex += 1
    this.progress =
      contexts.length === 0 ? 1 : this.nextContextIndex / contexts.length
    this.solved = this.nextContextIndex === contexts.length
  }

  private processCopperPourPair(context: CopperPourPairContext): void {
    const [fromLayer, toLayer] = this.options.layers
    const fromLayerShapes = context.fromLayerPours.map(
      (copperPour) => copperPour.brep_shape,
    )
    const toLayerShapes = context.toLayerPours.map(
      (copperPour) => copperPour.brep_shape,
    )
    const fromBounds = getShapeUnionBounds(fromLayerShapes)
    const toBounds = getShapeUnionBounds(toLayerShapes)
    if (!fromBounds || !toBounds) return

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
      return
    }

    const viaRadius = this.options.viaOuterDiameter / 2
    const requiredCopperRadius = viaRadius + this.options.pourEdgeClearance
    const requiredObstacleRadius = viaRadius + this.options.obstacleClearance
    const xCoordinates = getGridCoordinates({
      minimum: overlapBounds.minX + requiredCopperRadius,
      maximum: overlapBounds.maxX - requiredCopperRadius,
      origin: this.options.gridOrigin.x,
      pitch: this.options.viaPitch,
    })
    const yCoordinates = getGridCoordinates({
      minimum: overlapBounds.minY + requiredCopperRadius,
      maximum: overlapBounds.maxY - requiredCopperRadius,
      origin: this.options.gridOrigin.y,
      pitch: this.options.viaPitch,
    })

    for (const y of yCoordinates) {
      for (const x of xCoordinates) {
        const center = { x, y }
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

        const referencePour = context.fromLayerPours[0]!
        this.addVia({
          center,
          sourceNetId: context.sourceNetId,
          sourceNet: context.sourceNet,
          referencePour,
        })
      }
    }
  }

  private processTraceCopperPour(context: TraceCopperPourContext): void {
    const explicitPourShapes = context.explicitPours.map(
      (copperPour) => copperPour.brep_shape,
    )
    const viaRadius = this.options.viaOuterDiameter / 2
    const requiredCopperRadius = viaRadius + this.options.pourEdgeClearance
    const requiredObstacleRadius = viaRadius + this.options.obstacleClearance
    const explicitPourBounds = getShapeUnionBounds(explicitPourShapes)
    if (!explicitPourBounds) return

    const isOutsideExplicitPourBounds = (point: Point) =>
      point.x < explicitPourBounds.minX ||
      point.x > explicitPourBounds.maxX ||
      point.y < explicitPourBounds.minY ||
      point.y > explicitPourBounds.maxY

    for (const pcbTrace of context.pcbTraces) {
      const outsideWirePoints = pcbTrace.route.filter(
        (routePoint): routePoint is PcbTraceRoutePointWire =>
          routePoint.route_type === "wire" &&
          String(routePoint.layer) === String(context.traceLayer) &&
          isOutsideExplicitPourBounds(routePoint),
      )
      const distanceToClosestOutsidePoint = (center: Point) =>
        Math.min(
          ...outsideWirePoints.map((outsidePoint) =>
            Math.hypot(center.x - outsidePoint.x, center.y - outsidePoint.y),
          ),
        )
      const entryCandidateCenters = getTraceCopperCandidateCenters({
        pcbTraces: [pcbTrace],
        layer: context.traceLayer,
        pitch: this.options.viaPitch,
      }).sort(
        (first, second) =>
          distanceToClosestOutsidePoint(first) -
          distanceToClosestOutsidePoint(second),
      )

      const entryCenter = entryCandidateCenters.find(
        (center) =>
          isViaAnnulusInsideTraceCopper({
            center,
            radius: requiredCopperRadius,
            pcbTrace,
            layer: context.traceLayer,
          }) &&
          isViaAnnulusInsideShapeUnion({
            center,
            radius: requiredCopperRadius,
            shapes: explicitPourShapes,
          }) &&
          !isTooCloseToOccupiedVia({
            center,
            radius: viaRadius,
            occupiedVias: this.occupiedVias,
            minimumViaSeparation: this.options.minimumViaSeparation,
          }) &&
          !doesViaIntersectStitchingObstacle({
            center,
            radius: requiredObstacleRadius,
            obstacles: this.stitchingObstacles,
          }),
      )
      if (!entryCenter) continue

      // One via is enough to connect the routed-layer trace copper to the
      // explicit opposite-layer pour. Do not continue sampling vias down the
      // routed trace corridor.
      this.addVia({
        center: entryCenter,
        sourceNetId: context.sourceNetId,
        sourceNet: context.sourceNet,
        referencePour: context.explicitPours[0]!,
      })
    }
  }

  private addVia({
    center,
    sourceNetId,
    sourceNet,
    referencePour,
  }: {
    center: Point
    sourceNetId: SourceNet["source_net_id"]
    sourceNet?: SourceNet
    referencePour: PcbCopperPourBRep
  }): void {
    const [fromLayer, toLayer] = this.options.layers
    const viaRadius = this.options.viaOuterDiameter / 2
    let pcbViaId = `via_stitch_via_${this.nextViaId++}`
    while (this.existingPcbViaIds.has(pcbViaId)) {
      pcbViaId = `via_stitch_via_${this.nextViaId++}`
    }
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
      source_net_id: sourceNetId,
      subcircuit_id: referencePour.subcircuit_id,
      pcb_group_id: referencePour.pcb_group_id,
      subcircuit_connectivity_map_key:
        sourceNet?.subcircuit_connectivity_map_key,
      is_tented: this.options.isTented,
    } as ViaStitchPcbVia
    this.pcbVias.push(pcbVia)
    this.existingPcbViaIds.add(pcbViaId)
    this.occupiedVias.push({ center, radius: viaRadius })
  }

  override getOutput(): ViaStitchSolverOutput {
    return {
      processedCopperPourPairCount: this.copperPourPairContexts.length,
      pcbVias: this.pcbVias,
    }
  }
}
