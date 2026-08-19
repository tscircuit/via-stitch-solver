import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
  PcbBoard,
  PcbCopperPourBRep,
  PcbTrace,
  PcbTraceRoutePointWire,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { GroundPourTraceEntryStitchingCircuit } from "examples/ground-pour-trace-entry-stitching"
import {
  getShapeUnionBounds,
  isPointInShapeUnion,
  isViaAnnulusInsideShapeUnion,
} from "lib/geometry/brep-point-containment"
import { isViaAnnulusInsideTraceCopper } from "lib/geometry/trace-copper"
import { ViaStitchSolver } from "lib/index"

const getDistanceToSegment = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const squaredLength = deltaX ** 2 + deltaY ** 2
  const interpolation =
    squaredLength === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
              squaredLength,
          ),
        )
  return Math.hypot(
    point.x - (start.x + deltaX * interpolation),
    point.y - (start.y + deltaY * interpolation),
  )
}

test("stitches a top GND trace to an explicit bottom pour", async () => {
  const circuit = new Circuit()
  circuit.add(<GroundPourTraceEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbBoard = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  const groundNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_ground === true,
  )
  const sourceTracesById = new Map(
    circuitJson
      .filter(
        (element): element is SourceTrace => element.type === "source_trace",
      )
      .map((sourceTrace) => [sourceTrace.source_trace_id, sourceTrace]),
  )
  const pcbTraces = circuitJson.filter(
    (element): element is PcbTrace => element.type === "pcb_trace",
  )
  const groundTraces = pcbTraces.filter((pcbTrace) => {
    const sourceTrace = pcbTrace.source_trace_id
      ? sourceTracesById.get(pcbTrace.source_trace_id)
      : undefined
    return (
      sourceTrace?.connected_source_net_ids.includes(
        groundNet!.source_net_id,
      ) ||
      (pcbTrace as PcbTrace & { connection_name?: string }).connection_name ===
        groundNet!.source_net_id
    )
  })
  const foreignTraces = pcbTraces.filter((pcbTrace) => {
    const sourceTrace = pcbTrace.source_trace_id
      ? sourceTracesById.get(pcbTrace.source_trace_id)
      : undefined
    return !sourceTrace?.connected_source_net_ids.includes(
      groundNet!.source_net_id,
    )
  })
  const explicitBottomPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.layer === "bottom" &&
      element.source_net_id === groundNet?.source_net_id,
  )

  expect(pcbBoard).toBeDefined()
  expect(groundNet).toBeDefined()
  expect(
    circuitJson
      .filter(
        (element): element is PcbCopperPourBRep =>
          element.type === "pcb_copper_pour" &&
          element.shape === "brep" &&
          element.source_net_id === groundNet!.source_net_id,
      )
      .map((pour) => pour.layer),
  ).toEqual(["bottom"])
  const boardViaHoleDiameter = pcbBoard!.min_via_hole_diameter!
  const boardViaPadDiameter = pcbBoard!.min_via_pad_diameter!
  expect({ boardViaHoleDiameter, boardViaPadDiameter }).toEqual({
    boardViaHoleDiameter: 0.2,
    boardViaPadDiameter: 0.3,
  })

  const bottomShapes = explicitBottomPours.map((pour) => pour.brep_shape)
  const bottomBounds = getShapeUnionBounds(bottomShapes)!
  const padsInsidePour = circuitJson.filter(
    (element) =>
      element.type === "pcb_smtpad" &&
      element.shape !== "polygon" &&
      isPointInShapeUnion({ x: element.x, y: element.y }, bottomShapes),
  )
  expect(padsInsidePour).toHaveLength(2)

  const enteringGroundTraces = groundTraces.filter((pcbTrace) => {
    const topWirePoints = pcbTrace.route.filter(
      (routePoint): routePoint is PcbTraceRoutePointWire =>
        routePoint.route_type === "wire" && routePoint.layer === "top",
    )
    return (
      topWirePoints.some((routePoint) =>
        isPointInShapeUnion(routePoint, bottomShapes),
      ) &&
      topWirePoints.some(
        (routePoint) =>
          routePoint.x < bottomBounds.minX ||
          routePoint.x > bottomBounds.maxX ||
          routePoint.y < bottomBounds.minY ||
          routePoint.y > bottomBounds.maxY,
      )
    )
  })
  expect(enteringGroundTraces).toHaveLength(1)
  expect(
    enteringGroundTraces[0]!.route.every(
      (routePoint) =>
        routePoint.route_type !== "wire" || routePoint.width === 0.6,
    ),
  ).toBe(true)
  expect(foreignTraces.length).toBeGreaterThanOrEqual(3)

  const pourEdgeClearance = 0.1
  const obstacleClearance = 0.2
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundNet!.source_net_id],
      viaPitch: 2.4,
      pourEdgeClearance,
      obstacleClearance,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(0)
  expect(output.pcbVias).toHaveLength(1)
  const stitchVia = output.pcbVias[0]!
  expect(stitchVia.source_net_id).toBe(groundNet!.source_net_id)
  expect(stitchVia.hole_diameter).toBe(boardViaHoleDiameter)
  expect(stitchVia.outer_diameter).toBe(boardViaPadDiameter)

  const requiredCopperRadius = boardViaPadDiameter / 2 + pourEdgeClearance
  expect(
    isViaAnnulusInsideShapeUnion({
      center: stitchVia,
      radius: requiredCopperRadius,
      shapes: bottomShapes,
    }),
  ).toBe(true)
  expect(
    isViaAnnulusInsideTraceCopper({
      center: stitchVia,
      radius: requiredCopperRadius,
      pcbTrace: enteringGroundTraces[0]!,
      layer: "top",
    }),
  ).toBe(true)

  const requiredObstacleRadius = boardViaPadDiameter / 2 + obstacleClearance
  expect(
    foreignTraces.every((pcbTrace) => {
      const wirePoints = pcbTrace.route.filter(
        (routePoint) => routePoint.route_type === "wire",
      )
      return wirePoints.every((start, pointIndex) => {
        const end = wirePoints[pointIndex + 1]
        if (!end || end.layer !== start.layer) return true
        return (
          getDistanceToSegment(stitchVia, start, end) >=
          requiredObstacleRadius + Math.max(start.width, end.width) / 2
        )
      })
    }),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
