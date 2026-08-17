import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement } from "circuit-json"

const GroundPourCircuit = () => (
  <board width="20mm" height="14mm">
    <pcbnotetext
      pcbX={0}
      pcbY={6.2}
      fontSize={0.4}
      text="Existing top and bottom GND pours stitched with a regular via grid"
    />
    <net name="GND" isGroundNet />
    <net name="VCC" isPowerNet />
    <chip
      name="U1"
      footprint="soic8"
      pcbX={-4}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0805"
      pcbX={4}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <via
      pcbX={0}
      pcbY={0}
      connectsTo="net.GND"
      fromLayer="top"
      toLayer="bottom"
      holeDiameter="0.3mm"
      outerDiameter="0.6mm"
    />
    <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
    <copperpour connectsTo="net.GND" layer="bottom" clearance="0.3mm" />
  </board>
)

export const renderGroundPourCircuit = async (): Promise<
  AnyCircuitElement[]
> => {
  const circuit = new Circuit()
  circuit.add(<GroundPourCircuit />)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
