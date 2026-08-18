import { Circuit } from "@tscircuit/core"
import { expect, test } from "bun:test"
import type { PcbTrace, SourceNet } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { ViaStitchSolver } from "lib/index"

const renderTraceFenceCircuit = async ({
  withLayerTransitions = false,
}: {
  withLayerTransitions?: boolean
} = {}) => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="18mm">
      <pcbnotetext
        pcbX={0}
        pcbY={7.7}
        fontSize={0.45}
        text={
          withLayerTransitions
            ? "GND via fence follows both edges of a layer-changing trace"
            : "GND via fence follows both edges and bends of a routed trace"
        }
      />
      <net name="GND" isGroundNet />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-11}
        pcbY={-3}
      />
      <resistor name="R2" resistance="1k" footprint="0603" pcbX={11} pcbY={3} />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        thickness="0.6mm"
        pcbPathRelativeTo=".R1 > .pin2"
        pcbPath={
          withLayerTransitions
            ? [
                "R1.pin2",
                { x: 4, y: 0 },
                {
                  x: 7,
                  y: 3,
                  via: true,
                  fromLayer: "top" as const,
                  toLayer: "bottom" as const,
                },
                { x: 12, y: 3 },
                { x: 15, y: 6 },
                {
                  x: 18,
                  y: 6,
                  via: true,
                  fromLayer: "bottom" as const,
                  toLayer: "top" as const,
                },
                "R2.pin1",
              ]
            : [
                "R1.pin2",
                { x: 4, y: 0 },
                { x: 7, y: 3 },
                { x: 15, y: 3 },
                { x: 18, y: 6 },
                "R2.pin1",
              ]
        }
      />
      <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
      <copperpour connectsTo="net.GND" layer="bottom" clearance="0.3mm" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

const solveTraceFence = async ({
  withLayerTransitions = false,
}: {
  withLayerTransitions?: boolean
} = {}) => {
  const circuitJson = await renderTraceFenceCircuit({ withLayerTransitions })
  const groundSourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.is_ground === true,
  )
  const guideTrace = circuitJson.find(
    (element): element is PcbTrace => element.type === "pcb_trace",
  )
  expect(groundSourceNet).toBeDefined()
  expect(guideTrace).toBeDefined()

  const solver = new ViaStitchSolver({
    circuitJson,
    options: {
      sourceNetIds: [groundSourceNet!.source_net_id],
      stitchingPattern: "fence",
      fenceTraceIds: [guideTrace!.pcb_trace_id],
      fenceTraceOffset: 0.8,
      viaPitch: 1.5,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.1,
      obstacleClearance: 0.2,
    },
  })
  solver.solve()
  return {
    circuitJson,
    groundSourceNet: groundSourceNet!,
    guideTrace: guideTrace!,
    output: solver.getOutput(),
  }
}

test("places GND fence vias along both edges of a bent routed trace", async () => {
  const { circuitJson, groundSourceNet, output } = await solveTraceFence()

  expect(output.processedCopperPourPairCount).toBe(1)
  expect(output.pcbVias.length).toBeGreaterThan(12)
  expect(
    output.pcbVias.every(
      (pcbVia) => pcbVia.source_net_id === groundSourceNet.source_net_id,
    ),
  ).toBe(true)
  expect(
    output.pcbVias.some(
      (pcbVia) => pcbVia.x > -3 && pcbVia.x < 3 && pcbVia.y > 0,
    ),
  ).toBe(true)
  expect(
    output.pcbVias.some(
      (pcbVia) => pcbVia.x > -3 && pcbVia.x < 3 && pcbVia.y < 0,
    ),
  ).toBe(true)
  expect(output.pcbVias.every((pcbVia) => Math.abs(pcbVia.y) < 6)).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "bent-trace")
})

test("continues trace-edge fences across top-bottom route transitions", async () => {
  const { circuitJson, guideTrace, output } = await solveTraceFence({
    withLayerTransitions: true,
  })
  const routeVias = guideTrace.route.filter(
    (routePoint) => routePoint.route_type === "via",
  )

  expect(routeVias).toHaveLength(2)
  expect(output.pcbVias.length).toBeGreaterThanOrEqual(10)
  expect(
    output.pcbVias.every((pcbVia) =>
      routeVias.every(
        (routeVia) =>
          Math.hypot(pcbVia.x - routeVia.x, pcbVia.y - routeVia.y) >= 0.8,
      ),
    ),
  ).toBe(true)

  const svg = convertCircuitJsonToPcbSvg([...circuitJson, ...output.pcbVias])
  await expect(svg).toMatchSvgSnapshot(import.meta.path, "layer-transitions")
})
