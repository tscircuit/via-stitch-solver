import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type { PcbCopperPourBRep, SourceNet } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  ViaStitchingQfn32Circuit,
  ViaStitchingQfp16Circuit,
  ViaStitchingSoic16Circuit,
  ViaStitchingSoic8Circuit,
  ViaStitchingTssop20Circuit,
} from "examples/copper-pour-via-stitching-circuits"
import { ViaStitchSolver } from "lib/index"

const examples = [
  {
    name: "SOIC-8",
    snapshotName: "soic8",
    CircuitComponent: ViaStitchingSoic8Circuit,
  },
  {
    name: "SOIC-16",
    snapshotName: "soic16",
    CircuitComponent: ViaStitchingSoic16Circuit,
  },
  {
    name: "QFP-16",
    snapshotName: "qfp16",
    CircuitComponent: ViaStitchingQfp16Circuit,
  },
  {
    name: "QFN-32",
    snapshotName: "qfn32",
    CircuitComponent: ViaStitchingQfn32Circuit,
  },
  {
    name: "TSSOP-20",
    snapshotName: "tssop20",
    CircuitComponent: ViaStitchingTssop20Circuit,
  },
]

for (const example of examples) {
  test(`stitches overlapping ${example.name} ground pours`, async () => {
    const circuit = new Circuit()
    const ExampleCircuit = example.CircuitComponent
    circuit.add(<ExampleCircuit />)
    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()
    const groundSourceNet = circuitJson.find(
      (element): element is SourceNet =>
        element.type === "source_net" && element.is_ground === true,
    )
    expect(groundSourceNet).toBeDefined()

    const groundCopperPours = circuitJson.filter(
      (element): element is PcbCopperPourBRep =>
        element.type === "pcb_copper_pour" &&
        element.shape === "brep" &&
        element.source_net_id === groundSourceNet!.source_net_id,
    )
    expect(
      new Set(groundCopperPours.map((copperPour) => copperPour.layer)),
    ).toEqual(new Set(["top", "bottom"]))

    const solver = new ViaStitchSolver({
      circuitJson,
      options: {
        viaPitch: 2,
        viaHoleDiameter: 0.3,
        viaOuterDiameter: 0.6,
        pourEdgeClearance: 0.2,
      },
    })
    solver.solve()
    const output = solver.getOutput()

    expect(output.processedCopperPourPairCount).toBe(1)
    expect(output.pcbVias.length).toBeGreaterThan(10)
    expect(
      output.pcbVias.every(
        (pcbVia) =>
          pcbVia.source_net_id === groundSourceNet!.source_net_id &&
          pcbVia.from_layer === "top" &&
          pcbVia.to_layer === "bottom" &&
          pcbVia.layers.join(",") === "top,bottom",
      ),
    ).toBe(true)
    expect(
      output.pcbVias.every(
        (pcbVia) =>
          Number.isInteger(pcbVia.x / 2) && Number.isInteger(pcbVia.y / 2),
      ),
    ).toBe(true)

    const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
    await expect(svg).toMatchSvgSnapshot(import.meta.path, example.snapshotName)
  })
}
