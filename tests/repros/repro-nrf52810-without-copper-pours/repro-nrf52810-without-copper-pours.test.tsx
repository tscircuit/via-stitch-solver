import { expect, test } from "bun:test"
import { checkViaPadClearance, runAllChecks } from "@tscircuit/checks"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { ViaStitchSolver } from "lib/index"
import type { ViaStitchSolverInput } from "lib/types"
import { runViaClearanceChecks } from "../../fixtures/run-via-checks"
import inputJson from "./solver-input.json"

// Captured immediately before ViaStitchSolver in core PR #3792 at e65fd987.
// The three routed-via errors already exist at this point, before stitching.
const input = inputJson as ViaStitchSolverInput

test("nRF52810 stitching does not introduce via DRC errors", async () => {
  const originalInput = structuredClone(input)
  const baselineErrors = runViaClearanceChecks(input.circuitJson)
  expect(checkViaPadClearance(input.circuitJson)).toHaveLength(3)
  const solver = new ViaStitchSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.getOutput().pcbVias.length).toBeGreaterThan(0)
  expect(
    runViaClearanceChecks([
      ...input.circuitJson,
      ...solver.getOutput().pcbVias,
    ]),
  ).toEqual(baselineErrors)
  expect(
    await runAllChecks(
      structuredClone([...input.circuitJson, ...solver.getOutput().pcbVias]),
    ),
  ).toEqual(await runAllChecks(structuredClone(input.circuitJson)))
  expect(input).toEqual(originalInput)
  await expect(
    convertCircuitJsonToPcbSvg([
      ...input.circuitJson,
      ...solver.getOutput().pcbVias,
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})

test("nRF52810 stitching respects stricter board DRC clearances", () => {
  const stricterInput = structuredClone(input)
  const board = stricterInput.circuitJson.find((e) => e.type === "pcb_board")!
  board.min_trace_to_pad_edge_clearance = 0.5
  board.min_pad_edge_to_pad_edge_clearance = 0.5
  const baselineErrors = runViaClearanceChecks(stricterInput.circuitJson)
  const solver = new ViaStitchSolver(stricterInput)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.getOutput().pcbVias.length).toBeGreaterThan(0)
  expect(
    runViaClearanceChecks([
      ...stricterInput.circuitJson,
      ...solver.getOutput().pcbVias,
    ]),
  ).toEqual(baselineErrors)
})
