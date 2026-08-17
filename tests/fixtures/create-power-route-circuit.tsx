import { Circuit } from "@tscircuit/core"
import type {
  AnyCircuitElement,
  PcbTrace,
  SourceNet,
  SourceTrace,
} from "circuit-json"

const FullRoutePowerCircuit = () => (
  <board width="24mm" height="16mm" autorouter="sequential_trace">
    <pcbnotetext
      pcbX={0}
      pcbY={7.3}
      fontSize={0.38}
      text="VCC corridor is poured on top and bottom; vias are distributed along the full route"
    />
    <net name="VCC" isPowerNet />
    <net name="GND" isGroundNet />
    <chip
      name="U1"
      footprint="soic8"
      pcbX={-7}
      pcbY={0}
      connections={{ pin2: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0805"
      layer="bottom"
      pcbX={7}
      pcbY={0}
      connections={{ pin2: "net.GND" }}
    />
    <resistor
      name="R1"
      resistance="10k"
      footprint="0603"
      pcbX={0}
      pcbY={5}
      connections={{ pin1: "U1.pin3", pin2: "net.GND" }}
    />
    <trace from="U1.pin1" to="net.VCC" thickness={0.8} />
    <trace from="C1.pin1" to="net.VCC" thickness={0.8} />
  </board>
)

export const renderPowerRouteCircuit = async (): Promise<
  AnyCircuitElement[]
> => {
  const circuit = new Circuit()
  circuit.add(<FullRoutePowerCircuit />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const vccSourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "VCC",
  )
  const vccSourceTrace = circuitJson.find(
    (element): element is SourceTrace =>
      element.type === "source_trace" &&
      vccSourceNet !== undefined &&
      element.connected_source_net_ids.includes(vccSourceNet.source_net_id),
  )
  if (!vccSourceTrace) throw new Error("Expected a VCC source trace")

  circuitJson.push({
    type: "pcb_trace",
    pcb_trace_id: "pcb_trace_test_vcc",
    source_trace_id: vccSourceTrace.source_trace_id,
    subcircuit_id: vccSourceTrace.subcircuit_id,
    route: [
      { route_type: "wire", x: -9, y: 0, width: 0.8, layer: "top" },
      { route_type: "wire", x: 0, y: 0, width: 0.8, layer: "top" },
      {
        route_type: "via",
        x: 0,
        y: 0,
        from_layer: "top",
        to_layer: "bottom",
      },
      { route_type: "wire", x: 0, y: 0, width: 0.8, layer: "bottom" },
      { route_type: "wire", x: 9, y: 0, width: 0.8, layer: "bottom" },
    ],
  } as PcbTrace)

  return circuitJson
}

export const getPowerPcbTraces = (
  circuitJson: AnyCircuitElement[],
): PcbTrace[] => {
  const powerSourceNetIds = new Set(
    circuitJson
      .filter(
        (element): element is SourceNet =>
          element.type === "source_net" && element.is_power === true,
      )
      .map((sourceNet) => sourceNet.source_net_id),
  )
  const powerSourceTraceIds = new Set(
    circuitJson
      .filter(
        (element): element is SourceTrace =>
          element.type === "source_trace" &&
          element.connected_source_net_ids.some((sourceNetId) =>
            powerSourceNetIds.has(sourceNetId),
          ),
      )
      .map((sourceTrace) => sourceTrace.source_trace_id),
  )
  return circuitJson.filter(
    (element): element is PcbTrace =>
      element.type === "pcb_trace" &&
      element.source_trace_id !== undefined &&
      powerSourceTraceIds.has(element.source_trace_id),
  )
}
