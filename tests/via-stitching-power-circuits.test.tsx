import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type {
  AnyCircuitElement,
  PcbTrace,
  SourceNet,
  SourceTrace,
} from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  VIA_STITCHING_POWER_TRACE_WIDTH_MM,
  ViaStitchingQfn32Circuit,
  ViaStitchingQfp16Circuit,
  ViaStitchingSoic16Circuit,
  ViaStitchingSoic8Circuit,
  ViaStitchingTssop20Circuit,
} from "examples/via-stitching-power-circuits"
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

const getPowerRouteDetails = (circuitJson: AnyCircuitElement[]) => {
  const powerSourceNetIds = new Set(
    circuitJson
      .filter(
        (element): element is SourceNet =>
          element.type === "source_net" && element.is_power === true,
      )
      .map((sourceNet) => sourceNet.source_net_id),
  )
  const powerSourceTraces = circuitJson.filter(
    (element): element is SourceTrace =>
      element.type === "source_trace" &&
      element.connected_source_net_ids.some((sourceNetId) =>
        powerSourceNetIds.has(sourceNetId),
      ),
  )
  const powerSourceTraceIds = new Set(
    powerSourceTraces.map((sourceTrace) => sourceTrace.source_trace_id),
  )
  const routedPowerTraces = circuitJson.filter(
    (element): element is PcbTrace =>
      element.type === "pcb_trace" &&
      element.source_trace_id !== undefined &&
      powerSourceTraceIds.has(element.source_trace_id),
  )

  return {
    powerSourceNetIds,
    powerSourceTraces,
    routedPowerTraces,
  }
}

for (const example of examples) {
  test(`pours and stitches the complete ${example.name} power routes`, async () => {
    const circuit = new Circuit()
    const ExampleCircuit = example.CircuitComponent
    circuit.add(<ExampleCircuit />)
    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()
    const { powerSourceNetIds, powerSourceTraces, routedPowerTraces } =
      getPowerRouteDetails(circuitJson)
    const existingTransitionPoints = routedPowerTraces.flatMap((pcbTrace) =>
      pcbTrace.route
        .filter((routePoint) => routePoint.route_type === "via")
        .map((routePoint) => ({ x: routePoint.x, y: routePoint.y })),
    )

    const solver = new ViaStitchSolver({
      circuitJson,
      options: {
        minimumPourWidth: 1.4,
        pourPadding: 0.3,
        viaPitch: 2,
        viaHoleDiameter: 0.3,
        viaOuterDiameter: 0.6,
        endpointClearance: 0.8,
        padMargin: 0.2,
        traceMargin: 0.2,
      },
    })
    solver.solve()
    const output = solver.getOutput()

    expect(powerSourceTraces.length).toBeGreaterThan(0)
    expect(
      powerSourceTraces.every(
        (sourceTrace) =>
          sourceTrace.min_trace_thickness ===
          VIA_STITCHING_POWER_TRACE_WIDTH_MM,
      ),
    ).toBe(true)
    expect(routedPowerTraces.length).toBeGreaterThan(0)
    expect(
      routedPowerTraces.every((pcbTrace) =>
        pcbTrace.route.some(
          (routePoint) =>
            routePoint.route_type === "wire" &&
            routePoint.width >= VIA_STITCHING_POWER_TRACE_WIDTH_MM,
        ),
      ),
    ).toBe(true)
    expect(output.processedPowerTraceCount).toBeGreaterThan(0)
    expect(output.detectedLayerTransitionCount).toBeGreaterThan(0)
    expect(output.pcbCopperPours.length).toBeGreaterThanOrEqual(
      output.processedPowerTraceCount * 2,
    )
    expect(
      new Set(output.pcbCopperPours.map((copperPour) => copperPour.layer)),
    ).toEqual(new Set(["top", "bottom"]))
    expect(
      output.pcbCopperPours.every(
        (copperPour) =>
          copperPour.source_net_id !== undefined &&
          powerSourceNetIds.has(copperPour.source_net_id) &&
          copperPour.covered_with_solder_mask,
      ),
    ).toBe(true)
    expect(output.pcbVias.length).toBeGreaterThan(
      output.detectedLayerTransitionCount,
    )
    expect(
      output.pcbVias.some((stitchingVia) =>
        existingTransitionPoints.every(
          (transitionPoint) =>
            Math.hypot(
              stitchingVia.x - transitionPoint.x,
              stitchingVia.y - transitionPoint.y,
            ) >= 1,
        ),
      ),
    ).toBe(true)

    const reinforcedCircuitJson = [
      ...circuitJson,
      ...output.pcbCopperPours,
      ...output.pcbVias,
    ]
    const svg = convertCircuitJsonToPcbSvg(reinforcedCircuitJson)
    await expect(svg).toMatchSvgSnapshotWithTolerance(
      import.meta.path,
      example.snapshotName,
      { diffThresholdPercent: 0.5 },
    )
  })
}
