export const dualNetVccPourOutline = [
  { x: -13, y: 4.6 },
  { x: -13, y: 6.5 },
  { x: -10.4, y: 6.5 },
  { x: -10.4, y: 6.8 },
  { x: -7.2, y: 6.8 },
  { x: -7.2, y: 0 },
  { x: -10.4, y: 0 },
  { x: -10.4, y: 4.6 },
  { x: -13, y: 4.6 },
]

export const dualNetGroundPourOutline = [
  { x: 7.2, y: -7.3 },
  { x: 10.4, y: -7.3 },
  { x: 10.4, y: -6.5 },
  { x: 13, y: -6.5 },
  { x: 13, y: -4.2 },
  { x: 10.4, y: -4.2 },
  { x: 10.4, y: -0.8 },
  { x: 7.2, y: -0.8 },
  { x: 7.2, y: -7.3 },
]

export const DualNetPourEntryStitchingCircuit = () => (
  <board width="40mm" height="24mm">
    <pcbnotetext
      pcbX={0}
      pcbY={11}
      fontSize={0.48}
      text="Separate local VCC and GND pours are stitched around their pads and entry traces"
    />
    <pcbnotetext
      pcbX={-10}
      pcbY={8}
      fontSize={0.42}
      text="VCC pour (top + bottom)"
    />
    <pcbnotetext
      pcbX={10}
      pcbY={-8}
      fontSize={0.42}
      text="GND pour (top + bottom)"
    />
    <net name="VCC" isPowerNet />
    <net name="GND" isGroundNet />

    <pinheader
      name="J1"
      pinCount={2}
      pcbX={-17}
      pcbY={5}
      connections={{ pin1: "net.VCC" }}
    />
    <pinheader
      name="J2"
      pinCount={2}
      pcbX={17}
      pcbY={-5}
      connections={{ pin1: "net.GND" }}
    />
    <chip name="U1" footprint="qfp16" pcbX={0} pcbY={0} />

    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="0805"
      pcbX={-7}
      pcbY={5.5}
      connections={{ pin1: "net.VCC" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0805"
      pcbX={-7}
      pcbY={2}
      connections={{ pin1: "net.VCC" }}
    />
    <capacitor
      name="C3"
      capacitance="10uF"
      footprint="0805"
      pcbX={7}
      pcbY={-2}
      connections={{ pin2: "net.GND" }}
    />
    <capacitor
      name="C4"
      capacitance="100nF"
      footprint="0805"
      pcbX={7}
      pcbY={-5.5}
      connections={{ pin2: "net.GND" }}
    />

    <trace name="VCC_ENTRY" from=".J1 > .pin1" to="net.VCC" thickness="0.6mm" />
    <trace name="GND_ENTRY" from=".J2 > .pin1" to="net.GND" thickness="0.6mm" />
    <trace
      name="SIGNAL_C1"
      from=".U1 > .pin5"
      to=".C1 > .pin2"
      thickness="0.25mm"
    />
    <trace
      name="SIGNAL_C2"
      from=".U1 > .pin6"
      to=".C2 > .pin2"
      thickness="0.25mm"
    />
    <trace
      name="SIGNAL_C3"
      from=".U1 > .pin13"
      to=".C3 > .pin1"
      thickness="0.25mm"
    />
    <trace
      name="SIGNAL_C4"
      from=".U1 > .pin14"
      to=".C4 > .pin1"
      thickness="0.25mm"
    />
    <trace
      name="CONNECTOR_RETURN_1"
      from=".J1 > .pin2"
      to=".U1 > .pin1"
      thickness="0.4mm"
    />
    <trace
      name="CONNECTOR_RETURN_2"
      from=".J2 > .pin2"
      to=".U1 > .pin9"
      thickness="0.4mm"
    />

    <copperpour
      connectsTo="net.VCC"
      layer="top"
      clearance="0.3mm"
      outline={dualNetVccPourOutline}
    />
    <copperpour
      connectsTo="net.VCC"
      layer="bottom"
      clearance="0.3mm"
      outline={dualNetVccPourOutline}
    />
    <copperpour
      connectsTo="net.GND"
      layer="top"
      clearance="0.3mm"
      outline={dualNetGroundPourOutline}
    />
    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      clearance="0.3mm"
      outline={dualNetGroundPourOutline}
    />
  </board>
)
