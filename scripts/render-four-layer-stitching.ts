import { mkdirSync, writeFileSync } from "node:fs"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Resvg } from "@resvg/resvg-js"
import { ViaStitchSolver } from "../lib"
import { fourLayerStitchingFixture } from "../tests/fixtures/four-layer-stitching"
const suffix = process.argv[2] ?? "before"
mkdirSync("docs/four-layer-stitching", { recursive: true })
const rows = fourLayerStitchingFixture(false),
  solver = new ViaStitchSolver({
    circuitJson: rows,
    options: { viaStitchPitch: 1, viaHoleDiameter: 0.3, viaOuterDiameter: 0.5 },
  })
solver.solve()
for (const layer of ["top", "inner1", "inner2", "bottom"] as const) {
  const svg = convertCircuitJsonToPcbSvg(
    [...rows, ...solver.getOutput().pcbVias],
    { layer },
  )
  const file = `docs/four-layer-stitching/${suffix}-${layer}`
  writeFileSync(file + ".svg", svg)
  writeFileSync(
    file + ".png",
    new Resvg(svg, { fitTo: { mode: "width", value: 1000 } }).render().asPng(),
  )
}
console.log(JSON.stringify({ suffix, vias: solver.getOutput().pcbVias.length }))
