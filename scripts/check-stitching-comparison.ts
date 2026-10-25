import { readFileSync } from "node:fs"
const base = JSON.parse(readFileSync(process.argv[2]!, "utf8")),
  head = JSON.parse(readFileSync(process.argv[3]!, "utf8"))
for (const result of head.cases) {
  const before = base.cases.find((c: any) => c.name === result.name)
  if (
    !before ||
    typeof result.inputSha256 !== "string" ||
    result.inputSha256.length !== 64 ||
    before.inputSha256 !== result.inputSha256
  )
    throw Error("Comparison inputs differ")
  if (
    !result.completed ||
    !result.inputUnchanged ||
    !result.vias ||
    result.wrongSpan ||
    result.traceContacts ||
    result.pourContacts
  )
    throw Error("Unsafe stitching result " + result.name)
  if (
    result.name === "two-layer-control" &&
    before.outputSha256 !== result.outputSha256
  )
    throw Error("Control geometry changed")
}
console.log(
  "All stitching cases complete, full-span and clear; two-layer control geometry unchanged.",
)
