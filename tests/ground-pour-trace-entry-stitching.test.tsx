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

test("stitches a local GND pour around two component pads", async () => {
  const circuit = new Circuit()
  circuit.add(<GroundPourTraceEntryStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

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
  const groundPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.source_net_id === groundNet?.source_net_id,
  )

  expect(groundNet).toBeDefined()

  const topGroundShapes = groundPours
    .filter((copperPour) => copperPour.layer === "top")
    .map((copperPour) => copperPour.brep_shape)
  const bottomGroundShapes = groundPours
    .filter((copperPour) => copperPour.layer === "bottom")
    .map((copperPour) => copperPour.brep_shape)
  const topGroundBounds = getShapeUnionBounds(topGroundShapes)!
  const padsInsidePour = circuitJson.filter(
    (element) =>
      element.type === "pcb_smtpad" &&
      element.shape !== "polygon" &&
      isPointInShapeUnion({ x: element.x, y: element.y }, topGroundShapes),
  )
  expect(padsInsidePour).toHaveLength(2)
  const groundEntryTraces = groundTraces.filter((pcbTrace) => {
    const topWirePoints = pcbTrace.route.filter(
      (routePoint): routePoint is PcbTraceRoutePointWire =>
        routePoint.route_type === "wire" && routePoint.layer === "top",
    )
    return (
      topWirePoints.some((routePoint) =>
        isPointInShapeUnion(routePoint, topGroundShapes),
      ) &&
      topWirePoints.some(
        (routePoint) =>
          routePoint.x < topGroundBounds.minX ||
          routePoint.x > topGroundBounds.maxX ||
          routePoint.y < topGroundBounds.minY ||
          routePoint.y > topGroundBounds.maxY,
      )
    )
  })
  expect(groundEntryTraces).toHaveLength(1)
  expect(
    groundEntryTraces.every((pcbTrace) =>
      pcbTrace.route.every(
        (routePoint) =>
          routePoint.route_type !== "wire" || routePoint.width === 0.6,
      ),
    ),
  ).toBe(true)
  expect(new Set(groundPours.map((copperPour) => copperPour.layer))).toEqual(
    new Set(["top", "bottom"]),
  )
  expect(foreignTraces.length).toBeGreaterThanOrEqual(3)

  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundNet!.source_net_id],
      viaPitch: 2.4,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.1,
      obstacleClearance: 0.2,
      gridOrigin: { x: 0.8, y: 0 },
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(2)
  expect(
    output.pcbVias.every(
      (pcbVia) => pcbVia.source_net_id === groundNet!.source_net_id,
    ),
  ).toBe(true)

  expect(
    output.pcbVias.every(
      (pcbVia) =>
        isViaAnnulusInsideShapeUnion({
          center: pcbVia,
          radius: 0.4,
          shapes: topGroundShapes,
        }) &&
        isViaAnnulusInsideShapeUnion({
          center: pcbVia,
          radius: 0.4,
          shapes: bottomGroundShapes,
        }),
    ),
  ).toBe(true)

  expect(
    output.pcbVias.every((pcbVia) =>
      foreignTraces.every((pcbTrace) => {
        const wirePoints = pcbTrace.route.filter(
          (routePoint) => routePoint.route_type === "wire",
        )
        return wirePoints.every((start, pointIndex) => {
          const end = wirePoints[pointIndex + 1]
          if (!end || end.layer !== start.layer) return true
          return (
            getDistanceToSegment(pcbVia, start, end) >=
            0.3 + Math.max(start.width, end.width) / 2
          )
        })
      }),
    ),
  ).toBe(true)

  const entryVias = output.pcbVias.filter(
    (pcbVia) => !isOnGrid(pcbVia, { x: 0.8, y: 0 }, 2.4),
  )
  expect(entryVias).toHaveLength(groundEntryTraces.length)
  expect(
    entryVias.every((pcbVia) =>
      groundEntryTraces.some(
        (pcbTrace) =>
          isViaAnnulusInsideTraceCopper({
            center: pcbVia,
            radius: 0.4,
            pcbTrace,
            layer: "top",
          }) === false &&
          pcbTrace.route
            .filter((routePoint) => routePoint.route_type === "wire")
            .some((start, pointIndex, wirePoints) => {
              const end = wirePoints[pointIndex + 1]
              return (
                end !== undefined &&
                start.layer === end.layer &&
                getDistanceToSegment(pcbVia, start, end) < 0.01
              )
            }),
      ),
    ),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
