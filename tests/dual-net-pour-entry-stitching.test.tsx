import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
  BRepShape,
  PcbBoard,
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
import { isViaAnnulusInsideTraceCopper } from "lib/geometry/trace-copper"
import { ViaStitchSolver } from "lib/index"

const traceEntersBottomPour = ({
  pcbTrace,
  bottomShapes,
}: {
  pcbTrace: PcbTrace
  bottomShapes: BRepShape[]
}) => {
  const bounds = getShapeUnionBounds(bottomShapes)
  if (!bounds) return false
  const topWirePoints = pcbTrace.route.filter(
    (routePoint): routePoint is PcbTraceRoutePointWire =>
      routePoint.route_type === "wire" && routePoint.layer === "top",
  )
  return (
    topWirePoints.some((point) => isPointInShapeUnion(point, bottomShapes)) &&
    topWirePoints.some(
      (point) =>
        point.x < bounds.minX ||
        point.x > bounds.maxX ||
        point.y < bounds.minY ||
        point.y > bounds.maxY,
    )
  )
}

test("stitches top VCC and GND traces to separate bottom pours", async () => {
  const circuit = new Circuit()
  circuit.add(<DualNetPourEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbBoard = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  const sourceNets = circuitJson.filter(
    (element): element is SourceNet => element.type === "source_net",
  )
  const powerNet = sourceNets.find((sourceNet) => sourceNet.is_power)
  const groundNet = sourceNets.find((sourceNet) => sourceNet.is_ground)
  expect(pcbBoard).toBeDefined()
  expect(powerNet).toBeDefined()
  expect(groundNet).toBeDefined()
  const boardViaHoleDiameter = pcbBoard!.min_via_hole_diameter!
  const boardViaPadDiameter = pcbBoard!.min_via_pad_diameter!
  expect({ boardViaHoleDiameter, boardViaPadDiameter }).toEqual({
    boardViaHoleDiameter: 0.2,
    boardViaPadDiameter: 0.3,
  })

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

  const bottomPoursByNetId = new Map<string, PcbCopperPourBRep[]>()
  for (const element of circuitJson) {
    if (
      element.type !== "pcb_copper_pour" ||
      element.shape !== "brep" ||
      element.layer !== "bottom" ||
      !element.source_net_id ||
      !targetNetIds.has(element.source_net_id)
    ) {
      continue
    }
    const netPours = bottomPoursByNetId.get(element.source_net_id) ?? []
    netPours.push(element)
    bottomPoursByNetId.set(element.source_net_id, netPours)
  }

  expect(
    circuitJson
      .filter(
        (element): element is PcbCopperPourBRep =>
          element.type === "pcb_copper_pour" &&
          element.shape === "brep" &&
          element.source_net_id !== undefined &&
          targetNetIds.has(element.source_net_id),
      )
      .every((pour) => pour.layer === "bottom"),
  ).toBe(true)

  const enteringTracesByNetId = new Map<string, PcbTrace[]>()
  const bottomShapesByNetId = new Map<string, BRepShape[]>()
  for (const sourceNetId of targetNetIds) {
    const bottomShapes = (bottomPoursByNetId.get(sourceNetId) ?? []).map(
      (pour) => pour.brep_shape,
    )
    bottomShapesByNetId.set(sourceNetId, bottomShapes)
    expect(bottomShapes.length).toBeGreaterThan(0)

    const padsInsidePour = circuitJson.filter(
      (element) =>
        element.type === "pcb_smtpad" &&
        element.shape !== "polygon" &&
        isPointInShapeUnion({ x: element.x, y: element.y }, bottomShapes),
    )
    expect(padsInsidePour).toHaveLength(2)

    const enteringTraces = (tracesByNetId.get(sourceNetId) ?? []).filter(
      (pcbTrace) => traceEntersBottomPour({ pcbTrace, bottomShapes }),
    )
    enteringTracesByNetId.set(sourceNetId, enteringTraces)
    expect(enteringTraces).toHaveLength(1)
    expect(
      enteringTraces[0]!.route.every(
        (routePoint) =>
          routePoint.route_type !== "wire" || routePoint.width === 0.6,
      ),
    ).toBe(true)
  }

  const pourEdgeClearance = 0.1
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [...targetNetIds],
      viaPitch: 2.4,
      pourEdgeClearance,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(0)
  expect(output.pcbVias).toHaveLength(2)
  const requiredCopperRadius = boardViaPadDiameter / 2 + pourEdgeClearance
  for (const sourceNetId of targetNetIds) {
    const netVias = output.pcbVias.filter(
      (pcbVia) => pcbVia.source_net_id === sourceNetId,
    )
    expect(netVias).toHaveLength(1)
    const stitchVia = netVias[0]!
    expect(stitchVia.hole_diameter).toBe(boardViaHoleDiameter)
    expect(stitchVia.outer_diameter).toBe(boardViaPadDiameter)

    expect(
      isViaAnnulusInsideShapeUnion({
        center: stitchVia,
        radius: requiredCopperRadius,
        shapes: bottomShapesByNetId.get(sourceNetId)!,
      }),
    ).toBe(true)
    expect(
      isViaAnnulusInsideTraceCopper({
        center: stitchVia,
        radius: requiredCopperRadius,
        pcbTrace: enteringTracesByNetId.get(sourceNetId)![0]!,
        layer: "top",
      }),
    ).toBe(true)
  }

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
