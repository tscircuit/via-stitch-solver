import { expect, test } from "bun:test"
import {
  checkPcbCopperOverKeepout,
  checkViasOffBoard,
  runAllChecks,
} from "@tscircuit/checks"
import type { PcbBoard, PcbVia } from "circuit-json"
import { ViaStitchSolver } from "lib/index"
import { createDrcInput } from "./fixtures/create-drc-input"
import { runViaClearanceChecks } from "./fixtures/run-via-checks"

test("does not publish unvalidated candidates or finish before the DRC phase", () => {
  const solver = new ViaStitchSolver(createDrcInput())
  solver.step()
  expect(solver.phase).toBe("drc")
  expect(solver.solved).toBe(false)
  expect(solver.progress).toBeLessThan(1)
  expect(solver.getOutput().pcbVias).toEqual([])
  solver.step()
  expect(solver.phase).toBe("complete")
  expect(solver.solved).toBe(true)
  expect(solver.progress).toBe(1)
  expect(solver.getOutput().pcbVias).toHaveLength(9)
})

test("finishes an empty input without emitting vias", () => {
  const solver = new ViaStitchSolver({ circuitJson: [] })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.getOutput().pcbVias).toEqual([])
})

for (const sourceNetId of ["ground", "signal"]) {
  test(`checks spacing against existing ${sourceNetId} vias and preserves them`, () => {
    const input = createDrcInput()
    const board = input.circuitJson[0] as PcbBoard
    board.min_via_hole_edge_to_via_hole_edge_clearance = 1
    const existingVia: PcbVia = {
      type: "pcb_via",
      pcb_via_id: "via_stitch_via_0",
      source_net_id: sourceNetId,
      x: 1,
      y: 0,
      hole_diameter: 0.3,
      outer_diameter: 0.6,
      layers: ["top", "bottom"],
    }
    input.circuitJson.push(existingVia)
    const originalInput = structuredClone(input)
    const solver = new ViaStitchSolver(input)
    solver.solve()
    const vias = solver.getOutput().pcbVias
    expect(vias).toHaveLength(7)
    expect(vias.some((via) => via.pcb_via_id === existingVia.pcb_via_id)).toBe(
      false,
    )
    expect(runViaClearanceChecks([...input.circuitJson, ...vias])).toEqual([])
    expect(input).toEqual(originalInput)
  })
}

test("checks spacing between generated vias", () => {
  const input = createDrcInput()
  const board = input.circuitJson[0] as PcbBoard
  board.min_via_hole_edge_to_via_hole_edge_clearance = 2
  const solver = new ViaStitchSolver(input)
  solver.solve()
  expect(solver.getOutput().pcbVias).toEqual([])
})

test("rejects pad clearance violations allowed by the geometric obstacle margin", async () => {
  const input = createDrcInput()
  const board = input.circuitJson[0] as PcbBoard
  board.min_pad_edge_to_pad_edge_clearance = 0.7
  input.circuitJson.push({
    type: "pcb_smtpad",
    pcb_smtpad_id: "pad",
    pcb_component_id: "component",
    shape: "circle",
    x: 0.9,
    y: 0,
    radius: 0.1,
    layer: "top",
  })
  const solver = new ViaStitchSolver(input)
  solver.solve()
  const vias = solver.getOutput().pcbVias
  expect(vias).toHaveLength(8)
  expect(vias.some((via) => via.x === 0 && via.y === 0)).toBe(false)
  expect(await runAllChecks([...input.circuitJson, ...vias])).toEqual([])
})

test("checks board edge clearance against the board outline", () => {
  const input = createDrcInput()
  const board = input.circuitJson[0] as PcbBoard
  board.outline = [
    { x: -3, y: -3 },
    { x: 2.5, y: -3 },
    { x: 2.5, y: 3 },
    { x: -3, y: 3 },
  ]
  board.min_board_edge_clearance = 0.4
  const solver = new ViaStitchSolver(input)
  solver.solve()
  const vias = solver.getOutput().pcbVias
  expect(vias).toHaveLength(6)
  expect(vias.every((via) => via.x < 2)).toBe(true)
  expect(checkViasOffBoard([...input.circuitJson, ...vias])).toEqual([])
})

test("rejects keepout violations without rejecting unrelated vias for existing copper", () => {
  const input = createDrcInput()
  input.circuitJson.push({
    type: "pcb_keepout",
    pcb_keepout_id: "keepout",
    shape: "rect",
    center: { x: 0, y: 0 },
    width: 1,
    height: 1,
    layers: ["top"],
  })
  const solver = new ViaStitchSolver(input)
  solver.solve()
  const vias = solver.getOutput().pcbVias
  expect(vias).toHaveLength(8)
  expect(vias.some((via) => via.x === 0 && via.y === 0)).toBe(false)
  expect(checkPcbCopperOverKeepout([...input.circuitJson, ...vias])).toEqual([])
})

for (const sourceNetId of ["ground", "signal"]) {
  test(`checks trace clearance using ${sourceNetId} connectivity`, () => {
    const input = createDrcInput()
    input.circuitJson.push(
      {
        type: "source_trace",
        source_trace_id: "source_trace",
        connected_source_net_ids: [sourceNetId],
        connected_source_port_ids: [],
      },
      {
        type: "pcb_trace",
        pcb_trace_id: "trace",
        source_trace_id: "source_trace",
        route: [
          { route_type: "wire", x: -3, y: 0, width: 0.2, layer: "top" },
          { route_type: "wire", x: 3, y: 0, width: 0.2, layer: "top" },
        ],
      },
    )
    const solver = new ViaStitchSolver(input)
    solver.solve()
    const vias = solver.getOutput().pcbVias
    expect(vias).toHaveLength(sourceNetId === "ground" ? 9 : 6)
    expect(runViaClearanceChecks([...input.circuitJson, ...vias])).toEqual([])
  })
}
