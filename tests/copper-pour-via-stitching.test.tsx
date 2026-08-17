import { expect, test } from "bun:test"
import type { SourceNet } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { ViaStitchSolver } from "lib/index"
import { renderGroundPourCircuit } from "./fixtures/create-ground-pour-circuit"

test("stitches the overlap of existing same-net copper pours", async () => {
  const circuitJson = await renderGroundPourCircuit()
  const groundSourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_ground === true,
  )
  expect(groundSourceNet).toBeDefined()

  const originalCopperPourCount = circuitJson.filter(
    (element) => element.type === "pcb_copper_pour",
  ).length
  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundSourceNet!.source_net_id],
      viaPitch: 2,
      pourEdgeClearance: 0.2,
    },
  })

  solver.solve()
  const output = solver.getOutput()

  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(10)
  expect(
    output.pcbVias.some((pcbVia) => pcbVia.x === 0 && pcbVia.y === 0),
  ).toBe(false)
  expect(
    circuitJson.filter((element) => element.type === "pcb_copper_pour"),
  ).toHaveLength(originalCopperPourCount)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
