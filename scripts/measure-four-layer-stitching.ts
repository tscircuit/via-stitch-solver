import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fourLayerStitchingFixture } from "../tests/fixtures/four-layer-stitching"
const modulePath = resolve(process.argv[2] ?? ".", "lib/index.ts"),
  { ViaStitchSolver } = await import(pathToFileURL(modulePath).href)
const cases = [
  { name: "inner-plane-pair", input: fourLayerStitchingFixture(false) },
  { name: "outer-pair-inner-copper", input: fourLayerStitchingFixture(true) },
  {
    name: "two-layer-control",
    input: fourLayerStitchingFixture(true)
      .filter(
        (r) =>
          r.type !== "pcb_trace" &&
          !(
            r.type === "pcb_copper_pour" &&
            r.pcb_copper_pour_id === "foreign-pour"
          ),
      )
      .map((r) => (r.type === "pcb_board" ? { ...r, num_layers: 2 } : r)),
  },
]
const reports = []
for (const sample of cases) {
  const before = JSON.stringify(sample.input),
    times: number[] = []
  let solver: any
  for (let i = 0; i < 12; i++) {
    const at = performance.now()
    solver = new ViaStitchSolver({
      circuitJson: sample.input,
      options: {
        viaStitchPitch: 1,
        viaHoleDiameter: 0.3,
        viaOuterDiameter: 0.5,
        obstacleClearance: 0.2,
      },
    })
    solver.solve()
    if (i >= 2) times.push(performance.now() - at)
  }
  times.sort((a, b) => a - b)
  const vias = solver.getOutput().pcbVias,
    expectedLayers =
      sample.name === "two-layer-control"
        ? ["top", "bottom"]
        : ["top", "inner1", "inner2", "bottom"]
  const wrongSpan = vias.filter(
    (v: any) => JSON.stringify(v.layers) !== JSON.stringify(expectedLayers),
  ).length
  const traceContacts =
    sample.name === "two-layer-control"
      ? 0
      : vias.filter(
          (v: any) =>
            Math.hypot(Math.max(Math.abs(v.x) - 3, 0), v.y) < 0.55 - 1e-8,
        ).length
  const pourContacts =
    sample.name === "two-layer-control"
      ? 0
      : vias.filter(
          (v: any) =>
            Math.hypot(
              Math.max(-1 - v.x, v.x - 1, 0),
              Math.max(-2 - v.y, v.y + 1, 0),
            ) <
            0.45 - 1e-8,
        ).length
  reports.push({
    name: sample.name,
    completed: solver.solved && !solver.failed,
    vias: vias.length,
    wrongSpan,
    traceContacts,
    pourContacts,
    inputUnchanged: JSON.stringify(sample.input) === before,
    outputSha256: createHash("sha256")
      .update(JSON.stringify(vias))
      .digest("hex"),
    medianMs: (times[4]! + times[5]!) / 2,
    trialsMs: times,
  })
}
const result = {
  scope:
    "Generated synthetic stitching cases only; not a complete PCB routing benchmark",
  modulePath,
  bun: Bun.version,
  cases: reports,
}
const json = JSON.stringify(result, null, 2) + "\n"
if (process.argv[3]) writeFileSync(process.argv[3], json)
console.log(json)
