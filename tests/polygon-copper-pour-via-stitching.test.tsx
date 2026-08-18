import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type { Point, SourceNet } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  concavePolygonCopperPourOutline,
  convexPolygonCopperPourOutline,
  ViaStitchingConcavePolygonCircuit,
  ViaStitchingConvexPolygonCircuit,
} from "examples/copper-pour-via-stitching-circuits"
import { ViaStitchSolver } from "lib/index"

const isPointInsidePolygon = (point: Point, polygon: Point[]) => {
  let isInside = false
  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++
  ) {
    const current = polygon[currentIndex]!
    const previous = polygon[previousIndex]!
    const crossesRay =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    if (crossesRay) isInside = !isInside
  }
  return isInside
}

const polygonExamples = [
  {
    name: "convex",
    CircuitComponent: ViaStitchingConvexPolygonCircuit,
    outline: convexPolygonCopperPourOutline,
  },
  {
    name: "concave",
    CircuitComponent: ViaStitchingConcavePolygonCircuit,
    outline: concavePolygonCopperPourOutline,
  },
]

for (const example of polygonExamples) {
  test(`stitches only inside a fixed ${example.name} copper-pour polygon`, async () => {
    const circuit = new Circuit()
    const ExampleCircuit = example.CircuitComponent
    circuit.add(<ExampleCircuit />)
    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()
    const groundSourceNet = circuitJson.find(
      (element): element is SourceNet =>
        element.type === "source_net" && element.is_ground === true,
    )
    expect(groundSourceNet).toBeDefined()

    const solver = new ViaStitchSolver({
      circuitJson,
      options: {
        viaPitch: 2,
        viaHoleDiameter: 0.3,
        viaOuterDiameter: 0.6,
        pourEdgeClearance: 0.2,
        obstacleClearance: 0.2,
      },
    })
    solver.solve()
    const output = solver.getOutput()

    expect(output.processedCopperPourPairCount).toBe(1)
    expect(output.pcbVias.length).toBeGreaterThan(5)
    expect(
      output.pcbVias.every(
        (pcbVia) =>
          pcbVia.source_net_id === groundSourceNet!.source_net_id &&
          isPointInsidePolygon(pcbVia, example.outline),
      ),
    ).toBe(true)

    const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
    await expect(svg).toMatchSvgSnapshot(import.meta.path, example.name)
  })
}
