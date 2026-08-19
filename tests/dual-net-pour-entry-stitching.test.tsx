import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
  BRepShape,
  LayerRef,
  PcbCopperPourBRep,
  PcbTrace,
  PcbTraceRoutePointWire,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { DualNetPourEntryStitchingCircuit } from "examples/dual-net-pour-entry-stitching"
import {
  getShapeUnionBounds,
  isPointInShapeUnion,
  isViaAnnulusInsideShapeUnion,
} from "lib/geometry/brep-point-containment"
import { ViaStitchSolver } from "lib/index"

const isOnGrid = (
  point: { x: number; y: number },
  origin: { x: number; y: number },
  pitch: number,
) =>
  Math.abs(
    (point.x - origin.x) / pitch - Math.round((point.x - origin.x) / pitch),
  ) < 1e-8 &&
  Math.abs(
    (point.y - origin.y) / pitch - Math.round((point.y - origin.y) / pitch),
  ) < 1e-8

const getShapesByLayer = (pours: PcbCopperPourBRep[]) =>
  new Map<LayerRef, BRepShape[]>(
    (["top", "bottom"] as const).map((layer) => [
      layer,
      pours
        .filter((pour) => pour.layer === layer)
        .map((pour) => pour.brep_shape),
    ]),
  )

const traceEntersPour = ({
  pcbTrace,
  shapesByLayer,
}: {
  pcbTrace: PcbTrace
  shapesByLayer: Map<LayerRef, BRepShape[]>
}) =>
  [...shapesByLayer].some(([layer, shapes]) => {
    const bounds = getShapeUnionBounds(shapes)
    if (!bounds) return false
    const wirePoints = pcbTrace.route.filter(
      (routePoint): routePoint is PcbTraceRoutePointWire =>
        routePoint.route_type === "wire" && routePoint.layer === layer,
    )
    return (
      wirePoints.some((point) => isPointInShapeUnion(point, shapes)) &&
      wirePoints.some(
        (point) =>
          point.x < bounds.minX ||
          point.x > bounds.maxX ||
          point.y < bounds.minY ||
          point.y > bounds.maxY,
      )
    )
  })

test("stitches separate VCC and GND pours with both nets entering", async () => {
  const circuit = new Circuit()
  circuit.add(<DualNetPourEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const sourceNets = circuitJson.filter(
    (element): element is SourceNet => element.type === "source_net",
  )
  const powerNet = sourceNets.find((sourceNet) => sourceNet.is_power)
  const groundNet = sourceNets.find((sourceNet) => sourceNet.is_ground)
  expect(powerNet).toBeDefined()
  expect(groundNet).toBeDefined()

  const targetNetIds = new Set([
    powerNet!.source_net_id,
    groundNet!.source_net_id,
  ])
  const sourceTracesById = new Map(
    circuitJson
      .filter(
        (element): element is SourceTrace => element.type === "source_trace",
      )
      .map((sourceTrace) => [sourceTrace.source_trace_id, sourceTrace]),
  )
  const tracesByNetId = new Map<string, PcbTrace[]>()
  for (const element of circuitJson) {
    if (element.type !== "pcb_trace") continue
    const sourceTrace = element.source_trace_id
      ? sourceTracesById.get(element.source_trace_id)
      : undefined
    const sourceNetIds = new Set(sourceTrace?.connected_source_net_ids ?? [])
    const connectionName = (element as PcbTrace & { connection_name?: string })
      .connection_name
    if (connectionName) sourceNetIds.add(connectionName)
    for (const sourceNetId of sourceNetIds) {
      if (!targetNetIds.has(sourceNetId)) continue
      const netTraces = tracesByNetId.get(sourceNetId) ?? []
      netTraces.push(element)
      tracesByNetId.set(sourceNetId, netTraces)
    }
  }

  const poursByNetId = new Map<string, PcbCopperPourBRep[]>()
  for (const element of circuitJson) {
    if (
      element.type !== "pcb_copper_pour" ||
      element.shape !== "brep" ||
      !element.source_net_id ||
      !targetNetIds.has(element.source_net_id)
    ) {
      continue
    }
    const netPours = poursByNetId.get(element.source_net_id) ?? []
    netPours.push(element)
    poursByNetId.set(element.source_net_id, netPours)
  }

  const shapesByNetAndLayer = new Map<string, Map<LayerRef, BRepShape[]>>()
  for (const sourceNetId of targetNetIds) {
    const pours = poursByNetId.get(sourceNetId) ?? []
    expect(new Set(pours.map((pour) => pour.layer))).toEqual(
      new Set(["top", "bottom"]),
    )
    const shapesByLayer = getShapesByLayer(pours)
    shapesByNetAndLayer.set(sourceNetId, shapesByLayer)

    const topShapes = shapesByLayer.get("top")!
    const padsInsidePour = circuitJson.filter(
      (element) =>
        element.type === "pcb_smtpad" &&
        element.shape !== "polygon" &&
        isPointInShapeUnion({ x: element.x, y: element.y }, topShapes),
    )
    expect(padsInsidePour).toHaveLength(2)

    const enteringTraces = (tracesByNetId.get(sourceNetId) ?? []).filter(
      (pcbTrace) => traceEntersPour({ pcbTrace, shapesByLayer }),
    )
    expect(enteringTraces).toHaveLength(1)
    expect(
      enteringTraces[0]!.route.every(
        (routePoint) =>
          routePoint.route_type !== "wire" || routePoint.width === 0.6,
      ),
    ).toBe(true)
  }

  const gridOrigin = { x: 0, y: 0.7 }
  const viaPitch = 2.4
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [...targetNetIds],
      viaPitch,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.1,
      obstacleClearance: 0.2,
      gridOrigin,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(2)
  for (const sourceNetId of targetNetIds) {
    const netVias = output.pcbVias.filter(
      (pcbVia) => pcbVia.source_net_id === sourceNetId,
    )
    expect(netVias.length).toBeGreaterThan(2)
    expect(
      netVias.filter((pcbVia) => !isOnGrid(pcbVia, gridOrigin, viaPitch)),
    ).toHaveLength(1)

    const shapesByLayer = shapesByNetAndLayer.get(sourceNetId)!
    expect(
      netVias.every(
        (pcbVia) =>
          isViaAnnulusInsideShapeUnion({
            center: pcbVia,
            radius: 0.4,
            shapes: shapesByLayer.get("top")!,
          }) &&
          isViaAnnulusInsideShapeUnion({
            center: pcbVia,
            radius: 0.4,
            shapes: shapesByLayer.get("bottom")!,
          }),
      ),
    ).toBe(true)
  }

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
