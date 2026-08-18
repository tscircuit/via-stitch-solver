import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement } from "circuit-json"

interface GroundPourCircuitProps {
  noteText?: string
  noteY?: number
  includeExistingVia?: boolean
}

const GroundPourCircuit = ({
  noteText = "Existing top and bottom GND pours stitched with a regular via grid",
  noteY = 6.2,
  includeExistingVia = true,
}: GroundPourCircuitProps) => (
  <board width="20mm" height="14mm">
    <pcbnotetext pcbX={0} pcbY={noteY} fontSize={0.4} text={noteText} />
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
    {includeExistingVia && (
      <via
        pcbX={0}
        pcbY={0}
        connectsTo="net.GND"
        fromLayer="top"
        toLayer="bottom"
        holeDiameter="0.3mm"
        outerDiameter="0.6mm"
      />
    )}
    <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
    <copperpour connectsTo="net.GND" layer="bottom" clearance="0.3mm" />
  </board>
)

export const renderGroundPourCircuit = async (
  options: GroundPourCircuitProps = {},
): Promise<AnyCircuitElement[]> => {
  const circuit = new Circuit()
  circuit.add(<GroundPourCircuit {...options} />)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
