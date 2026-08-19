import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
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

test("places one entry via instead of a row along a VCC trace", async () => {
  const circuit = new Circuit()
  circuit.add(<PowerPolygonEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

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
  const powerPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.source_net_id === powerNet?.source_net_id,
  )

  expect(powerNet).toBeDefined()
  expect(new Set(powerPours.map((pour) => pour.layer))).toEqual(
    new Set(["top", "bottom"]),
  )

  const topShapes = powerPours
    .filter((pour) => pour.layer === "top")
    .map((pour) => pour.brep_shape)
  const bottomShapes = powerPours
    .filter((pour) => pour.layer === "bottom")
    .map((pour) => pour.brep_shape)
  const topBounds = getShapeUnionBounds(topShapes)!
  const enteringPowerTraces = powerTraces.filter((pcbTrace) => {
    const topWirePoints = pcbTrace.route.filter(
      (routePoint): routePoint is PcbTraceRoutePointWire =>
        routePoint.route_type === "wire" && routePoint.layer === "top",
    )
    return (
      topWirePoints.some((routePoint) =>
        isPointInShapeUnion(routePoint, topShapes),
      ) &&
      topWirePoints.some(
        (routePoint) =>
          routePoint.x < topBounds.minX ||
          routePoint.x > topBounds.maxX ||
          routePoint.y < topBounds.minY ||
          routePoint.y > topBounds.maxY,
      )
    )
  })
  expect(enteringPowerTraces).toHaveLength(1)

  const gridOrigin = { x: 0.5, y: 0.5 }
  const viaPitch = 2.5
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [powerNet!.source_net_id],
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

  const entryVias = output.pcbVias.filter(
    (pcbVia) => !isOnGrid(pcbVia, gridOrigin, viaPitch),
  )
  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(10)
  expect(entryVias).toHaveLength(enteringPowerTraces.length)
  expect(
    entryVias.every(
      (pcbVia) => pcbVia.source_net_id === powerNet!.source_net_id,
    ),
  ).toBe(true)

  expect(
    output.pcbVias.every(
      (pcbVia) =>
        isViaAnnulusInsideShapeUnion({
          center: pcbVia,
          radius: 0.4,
          shapes: topShapes,
        }) &&
        isViaAnnulusInsideShapeUnion({
          center: pcbVia,
          radius: 0.4,
          shapes: bottomShapes,
        }),
    ),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
