import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type { PcbNoteText, PcbTraceRoutePoint } from "circuit-json"
import { ViaStitchSolver } from "lib/index"
import {
  getPowerPcbTraces,
  renderPowerRouteCircuit,
} from "./fixtures/create-power-route-circuit"

test("covers every segment of a route with repeated layer transitions", async () => {
  const circuitJson = await renderPowerRouteCircuit()
  const selectedPowerTrace = getPowerPcbTraces(circuitJson)[0]!
  selectedPowerTrace.route = [
    {
      route_type: "wire",
      x: -9,
      y: 0,
      width: 0.8,
      layer: "top",
    },
    {
      route_type: "wire",
      x: -3,
      y: 0,
      width: 0.8,
      layer: "top",
    },
    {
      route_type: "via",
      x: -3,
      y: 0,
      from_layer: "top",
      to_layer: "bottom",
    },
    {
      route_type: "wire",
      x: -3,
      y: 0,
      width: 0.8,
      layer: "bottom",
    },
    {
      route_type: "wire",
      x: 0,
      y: 0,
      width: 0.8,
      layer: "bottom",
    },
    {
      route_type: "via",
      x: 0,
      y: 0,
      from_layer: "bottom",
      to_layer: "top",
    },
    {
      route_type: "wire",
      x: 0,
      y: 0,
      width: 0.8,
      layer: "top",
    },
    {
      route_type: "wire",
      x: 3,
      y: 0,
      width: 0.8,
      layer: "top",
    },
    {
      route_type: "via",
      x: 3,
      y: 0,
      from_layer: "top",
      to_layer: "bottom",
    },
    {
      route_type: "wire",
      x: 3,
      y: 0,
      width: 0.8,
      layer: "bottom",
    },
    {
      route_type: "wire",
      x: 9,
      y: 0,
      width: 0.8,
      layer: "bottom",
    },
  ] as PcbTraceRoutePoint[]
  const pcbNoteText = circuitJson.find(
    (element): element is PcbNoteText => element.type === "pcb_note_text",
  )
  if (pcbNoteText) {
    pcbNoteText.text =
      "3 layer changes: full-route copper with distributed stitching vias"
    pcbNoteText.font_size = 0.28
  }
  const solverCircuitJson = circuitJson.filter(
    (element) =>
      element.type.startsWith("source_") ||
      element.type === "pcb_board" ||
      element.type === "pcb_note_text" ||
      element === selectedPowerTrace,
  )

  const solver = new ViaStitchSolver({
    circuitJson: solverCircuitJson,
    options: {
      pcbTraceIds: [selectedPowerTrace.pcb_trace_id],
      minimumPourWidth: 2,
      viaPitch: 1.5,
      endpointClearance: 0.75,
    },
  })
  solver.solve()
  const output = solver.getOutput()

  expect(output.processedPowerTraceCount).toBe(1)
  expect(output.detectedLayerTransitionCount).toBe(3)
  expect(output.pcbVias.length).toBeGreaterThan(4)
  expect(
    output.pcbVias.every((via) =>
      [-3, 0, 3].every((transitionX) => Math.abs(via.x - transitionX) >= 0.8),
    ),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([
    ...solverCircuitJson,
    ...output.pcbCopperPours,
    ...output.pcbVias,
  ])
  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "multiple-layer-transitions",
  )
})
