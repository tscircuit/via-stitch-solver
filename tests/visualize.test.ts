import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { ViaStitchSolver } from "lib"
import { createDrcInput } from "./fixtures/create-drc-input"

test("visualizes input, individual candidates, and rejected DRC vias without changing the output", async () => {
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
  const originalInput = structuredClone(input)
  const solver = new ViaStitchSolver(input)
  expect(solver.getConstructorParams()).toEqual([input])
  const initial = solver.visualize()
  expect(initial.coordinateSystem).toBe("cartesian")
  expect(initial.lines!.some((line) => line.label === "Board outline")).toBe(
    true,
  )
  await expect(getSvgFromGraphicsObject(initial)).toMatchSvgSnapshot(
    import.meta.path,
    "input",
  )

  solver.step() // Start candidate generation.
  solver.step() // Inspect the first grid point, not the entire net.
  expect(solver.candidate_generation!.stats.tested).toBe(1)
  expect(solver.candidate_generation!.stats.candidates).toBe(1)
  expect(solver.getOutput().pcbVias).toEqual([])
  const firstCandidate = solver.visualize()
  expect(
    firstCandidate.circles!.filter((circle) =>
      circle.label?.startsWith("Candidate:"),
    ),
  ).toHaveLength(1)
  expect(
    firstCandidate.circles!.find((circle) =>
      circle.label?.startsWith("Current grid point:"),
    )!.center,
  ).toEqual({ x: -2, y: -2 })
  await expect(getSvgFromGraphicsObject(firstCandidate)).toMatchSvgSnapshot(
    import.meta.path,
    "first-candidate",
  )

  solver.solveUntilStage("drc")
  expect(solver.candidate_generation!.stats.tested).toBe(9)
  expect(solver.getOutput().pcbVias).toEqual([])
  await expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
    "before-drc",
  )
  solver.solve()
  expect(solver.getOutput().pcbVias).toHaveLength(8)
  expect(solver.drc!.stats).toEqual({ candidates: 9, retained: 8, rejected: 1 })
  const final = solver.visualize()
  expect(
    final.circles!.filter((circle) =>
      circle.label?.startsWith("DRC retained:"),
    ),
  ).toHaveLength(8)
  expect(
    final.circles!.filter((circle) =>
      circle.label?.startsWith("DRC rejected:"),
    ),
  ).toHaveLength(1)
  expect(
    final.lines!.filter((line) => line.label?.startsWith("DRC rejected:")),
  ).toHaveLength(2)
  await expect(getSvgFromGraphicsObject(final)).toMatchSvgSnapshot(
    import.meta.path,
    "after-drc",
  )
  expect(input).toEqual(originalInput)
  const fresh = new ViaStitchSolver(...solver.getConstructorParams())
  fresh.solve()
  expect(fresh.getOutput()).toEqual(solver.getOutput())
})
