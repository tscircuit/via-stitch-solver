import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
  PcbCopperPourBRep,
  PcbTrace,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { PowerTraceCopperPourStitchingCircuit } from "examples/power-trace-copper-pour-stitching"
import { isViaAnnulusInsideShapeUnion } from "lib/geometry/brep-point-containment"
import { isViaAnnulusInsideTraceCopper } from "lib/geometry/trace-copper"
import { ViaStitchSolver } from "lib/index"

test("stitches a thick power trace to an overlapping same-net copper pour", async () => {
  const circuit = new Circuit()
  circuit.add(<PowerTraceCopperPourStitchingCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const powerNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "VCC",
  )
  const powerSourceTrace = circuitJson.find(
    (element): element is SourceTrace =>
      element.type === "source_trace" && element.name === "VCC_MAIN",
  )
  const powerTrace = circuitJson.find(
    (element): element is PcbTrace =>
      element.type === "pcb_trace" &&
      element.source_trace_id === powerSourceTrace?.source_trace_id,
  )
  const powerPours = circuitJson.filter(
    (element): element is PcbCopperPourBRep =>
      element.type === "pcb_copper_pour" &&
      element.shape === "brep" &&
      element.source_net_id === powerNet?.source_net_id,
  )

  expect(powerNet).toBeDefined()
  expect(powerSourceTrace?.connected_source_net_ids).toContain(
    powerNet!.source_net_id,
  )
  expect(powerTrace).toBeDefined()
  expect(
    powerTrace!.route.some(
      (routePoint) =>
        routePoint.route_type === "wire" && routePoint.width === 1.2,
    ),
  ).toBe(true)
  // The copper-pour stage may split one declared outline into multiple BRep
  // islands around clearances, but this example intentionally has no top VCC
  // pour.
  expect(powerPours.length).toBeGreaterThan(0)
  expect(powerPours.every((copperPour) => copperPour.layer === "bottom")).toBe(
    true,
  )

  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [powerNet!.source_net_id],
      viaPitch: 1.8,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.1,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(0)
  expect(output.pcbVias.length).toBeGreaterThan(5)
  expect(
    output.pcbVias.every(
      (pcbVia) => pcbVia.source_net_id === powerNet!.source_net_id,
    ),
  ).toBe(true)
  expect(
    output.pcbVias.every(
      (pcbVia) =>
        isViaAnnulusInsideTraceCopper({
          center: pcbVia,
          radius: 0.4,
          pcbTrace: powerTrace!,
          layer: "top",
        }) &&
        isViaAnnulusInsideShapeUnion({
          center: pcbVia,
          radius: 0.4,
          shapes: powerPours.map((copperPour) => copperPour.brep_shape),
        }),
    ),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)

  const groundNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "GND",
  )
  const differentNetCircuitJson = circuitJson.map((element) =>
    element.type === "pcb_copper_pour" &&
    element.source_net_id === powerNet!.source_net_id
      ? { ...element, source_net_id: groundNet!.source_net_id }
      : element,
  )
  const differentNetSolver = new ViaStitchSolver({
    circuitJson: differentNetCircuitJson,
  })
  differentNetSolver.solve()
  expect(differentNetSolver.getOutput().pcbVias).toHaveLength(0)
})
