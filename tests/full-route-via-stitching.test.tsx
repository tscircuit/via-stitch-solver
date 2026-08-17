import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { ViaStitchSolver } from "lib/index"
import { renderPowerRouteCircuit } from "./fixtures/create-power-route-circuit"

test("pours and stitches the complete routed power corridor", async () => {
  const circuitJson = await renderPowerRouteCircuit()
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      minimumPourWidth: 1.8,
      viaPitch: 2,
    },
  })

  solver.solve()
  const output = solver.getOutput()

  expect(output.processedPowerTraceCount).toBeGreaterThan(0)
  expect(output.detectedLayerTransitionCount).toBeGreaterThan(0)
  expect(output.pcbCopperPours.length).toBeGreaterThanOrEqual(2)
  expect(new Set(output.pcbCopperPours.map((pour) => pour.layer))).toEqual(
    new Set(["top", "bottom"]),
  )
  expect(
    output.pcbCopperPours.every((pour) => pour.covered_with_solder_mask),
  ).toBe(true)
  expect(output.pcbVias.length).toBeGreaterThan(2)
  expect(
    Math.max(...output.pcbVias.map((via) => via.x)) -
      Math.min(...output.pcbVias.map((via) => via.x)),
  ).toBeGreaterThan(4)

  const svg = convertCircuitJsonToPcbSvg([
    ...circuitJson,
    ...output.pcbCopperPours,
    ...output.pcbVias,
  ])
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "full-route")
})
