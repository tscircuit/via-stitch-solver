import { expect, test } from "bun:test"
import type { AnyCircuitElement, SourceNet } from "circuit-json"
import { ViaStitchSolver } from "lib/index"
import { renderGroundPourCircuit } from "./fixtures/create-ground-pour-circuit"

const solveGroundPours = async (extraElements: AnyCircuitElement[] = []) => {
  const circuitJson = [...(await renderGroundPourCircuit()), ...extraElements]
  const groundSourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_ground === true,
  )
  expect(groundSourceNet).toBeDefined()

  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundSourceNet!.source_net_id],
      pourEdgeClearance: 0.2,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  return solver.getOutput()
}

test("board-wide keepout blocks stitching vias", async () => {
  const withoutKeepout = await solveGroundPours()
  expect(withoutKeepout.pcbVias.length).toBeGreaterThan(100)

  const withKeepout = await solveGroundPours([
    {
      type: "pcb_keepout",
      pcb_keepout_id: "keepout_board",
      shape: "rect",
      center: { x: 0, y: 0 },
      width: 20,
      height: 14,
      layers: ["top", "bottom"],
    } as AnyCircuitElement,
  ])
  expect(withKeepout.pcbVias).toHaveLength(0)
})

test("outline keepout polygon is treated as a stitching obstacle", async () => {
  const output = await solveGroundPours([
    {
      type: "pcb_keepout",
      pcb_keepout_id: "keepout_outline",
      shape: "outline",
      outline: [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 },
      ],
      stroke_width: 0.2,
      layers: ["top"],
    } as unknown as AnyCircuitElement,
  ])

  expect(output.pcbVias.length).toBeGreaterThan(0)
  expect(
    output.pcbVias.every(
      (pcbVia) => Math.abs(pcbVia.x) >= 2 || Math.abs(pcbVia.y) >= 2,
    ),
  ).toBe(true)
})

test("keepout on unused layers does not block stitching", async () => {
  const withoutKeepout = await solveGroundPours()
  const withInnerKeepout = await solveGroundPours([
    {
      type: "pcb_keepout",
      pcb_keepout_id: "keepout_inner",
      shape: "circle",
      center: { x: 0, y: 0 },
      radius: 20,
      layers: ["inner1"],
    } as AnyCircuitElement,
  ])

  expect(withInnerKeepout.pcbVias.length).toBe(withoutKeepout.pcbVias.length)
})
