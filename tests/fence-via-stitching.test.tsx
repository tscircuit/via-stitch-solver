import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type { BRepShape, PcbCopperPourBRep, SourceNet } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { ViaStitchingConcavePolygonCircuit } from "examples/copper-pour-via-stitching-circuits"
import { ViaStitchSolver } from "lib/index"
import { renderGroundPourCircuit } from "./fixtures/create-ground-pour-circuit"

const getDistanceToSegment = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const squaredLength = segmentX ** 2 + segmentY ** 2
  const interpolation =
    squaredLength === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
              squaredLength,
          ),
        )
  return Math.hypot(
    point.x - (start.x + segmentX * interpolation),
    point.y - (start.y + segmentY * interpolation),
  )
}

const getDistanceToOuterBoundaries = (
  point: { x: number; y: number },
  shapes: BRepShape[],
) =>
  Math.min(
    ...shapes.flatMap((shape) =>
      shape.outer_ring.vertices.map((start, vertexIndex) =>
        getDistanceToSegment(
          point,
          start,
          shape.outer_ring.vertices[
            (vertexIndex + 1) % shape.outer_ring.vertices.length
          ]!,
        ),
      ),
    ),
  )

const solveFence = (
  circuitJson: Awaited<ReturnType<typeof renderGroundPourCircuit>>,
) => {
  const groundSourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_ground === true,
  )
  expect(groundSourceNet).toBeDefined()

  const groundCopperPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.source_net_id === groundSourceNet!.source_net_id,
  )
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundSourceNet!.source_net_id],
      stitchingPattern: "fence",
      viaPitch: 2,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.2,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  return {
    groundCopperPours,
    output: solver.getOutput(),
  }
}

test("places a via fence around a board-wide copper pour", async () => {
  const circuitJson = await renderGroundPourCircuit({
    noteText:
      "Existing top and bottom GND pours stitched with a perimeter via fence",
    noteY: 5.5,
    includeExistingVia: false,
  })
  const { groundCopperPours, output } = solveFence(circuitJson)

  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(10)
  expect(
    output.pcbVias.every((pcbVia) => {
      const boundaryDistance = getDistanceToOuterBoundaries(
        pcbVia,
        groundCopperPours.map((copperPour) => copperPour.brep_shape),
      )
      return (
        boundaryDistance >= 0.5 - 1e-8 &&
        boundaryDistance <= 0.5 * Math.SQRT2 + 1e-8
      )
    }),
  ).toBe(true)
  expect(
    output.pcbVias.some(
      (pcbVia) => Math.abs(pcbVia.x) < 5 && Math.abs(pcbVia.y) < 3,
    ),
  ).toBe(false)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "board-outline")
})

test("follows a concave copper-pour boundary with a via fence", async () => {
  const circuit = new Circuit()
  circuit.add(<ViaStitchingConcavePolygonCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const { groundCopperPours, output } = solveFence(circuitJson)

  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(10)
  expect(
    output.pcbVias.every((pcbVia) => {
      const boundaryDistance = getDistanceToOuterBoundaries(
        pcbVia,
        groundCopperPours.map((copperPour) => copperPour.brep_shape),
      )
      return (
        boundaryDistance >= 0.5 - 1e-8 &&
        boundaryDistance <= 0.5 * Math.SQRT2 + 1e-8
      )
    }),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "concave-polygon")
})

test("fences the shared boundary of differently sized layer pours", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="14mm">
      <net name="GND" isGroundNet />
      <copperpour
        connectsTo="net.GND"
        layer="top"
        outline={[
          { x: -13, y: -5 },
          { x: 2, y: -5 },
          { x: 2, y: 5 },
          { x: -13, y: 5 },
          { x: -13, y: -5 },
        ]}
      />
      <copperpour
        connectsTo="net.GND"
        layer="bottom"
        outline={[
          { x: -2, y: -5 },
          { x: 13, y: -5 },
          { x: 13, y: 5 },
          { x: -2, y: 5 },
          { x: -2, y: -5 },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const { output } = solveFence(circuit.getCircuitJson())

  expect(output.pcbVias.length).toBeGreaterThan(8)
  expect(Math.min(...output.pcbVias.map((pcbVia) => pcbVia.x))).toBeCloseTo(
    -1.3,
    8,
  )
  expect(Math.max(...output.pcbVias.map((pcbVia) => pcbVia.x))).toBeCloseTo(
    1.3,
    8,
  )
  expect(
    output.pcbVias.every(
      (pcbVia) =>
        pcbVia.x >= -1.3 - 1e-8 &&
        pcbVia.x <= 1.3 + 1e-8 &&
        pcbVia.y >= -4.3 - 1e-8 &&
        pcbVia.y <= 4.3 + 1e-8,
    ),
  ).toBe(true)
})
