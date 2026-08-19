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
import { PowerPolygonEntryStitchingCircuit } from "examples/power-polygon-entry-stitching"
import {
  getShapeUnionBounds,
  isPointInShapeUnion,
  isViaAnnulusInsideShapeUnion,
} from "lib/geometry/brep-point-containment"
import { isViaAnnulusInsideTraceCopper } from "lib/geometry/trace-copper"
import { ViaStitchSolver } from "lib/index"

test("stitches a top VCC trace to an explicit bottom pour", async () => {
  const circuit = new Circuit()
  circuit.add(<PowerPolygonEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbBoard = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  const powerNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_power === true,
  )
  const sourceTracesById = new Map(
    circuitJson
      .filter(
        (element): element is SourceTrace => element.type === "source_trace",
      )
      .map((sourceTrace) => [sourceTrace.source_trace_id, sourceTrace]),
  )
  const powerTraces = circuitJson.filter((element): element is PcbTrace => {
    if (element.type !== "pcb_trace") return false
    const sourceTrace = element.source_trace_id
      ? sourceTracesById.get(element.source_trace_id)
      : undefined
    return (
      sourceTrace?.connected_source_net_ids.includes(powerNet!.source_net_id) ||
      (element as PcbTrace & { connection_name?: string }).connection_name ===
        powerNet!.source_net_id
    )
  })
  const explicitBottomPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.layer === "bottom" &&
      element.source_net_id === powerNet?.source_net_id,
  )

  expect(pcbBoard).toBeDefined()
  expect(powerNet).toBeDefined()
  expect(
    circuitJson.filter(
      (element) =>
        element.type === "pcb_copper_pour" &&
        element.source_net_id === powerNet!.source_net_id,
    ),
  ).toEqual(explicitBottomPours)
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

  const enteringPowerTraces = powerTraces.filter((pcbTrace) => {
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
  expect(enteringPowerTraces).toHaveLength(1)
  expect(
    enteringPowerTraces[0]!.route.every(
      (routePoint) =>
        routePoint.route_type !== "wire" || routePoint.width === 0.6,
    ),
  ).toBe(true)

  const pourEdgeClearance = 0.1
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [powerNet!.source_net_id],
      viaPitch: 2.5,
      pourEdgeClearance,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(0)
  expect(output.pcbVias).toHaveLength(1)
  const stitchVia = output.pcbVias[0]!
  expect(stitchVia.source_net_id).toBe(powerNet!.source_net_id)
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
      pcbTrace: enteringPowerTraces[0]!,
      layer: "top",
    }),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
