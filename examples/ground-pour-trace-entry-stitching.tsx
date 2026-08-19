export const traceEntryGroundPourOutline = [
  { x: -4.6, y: -4.2 },
  { x: 1.5, y: -4.2 },
  { x: 1.5, y: 4.2 },
  { x: -4.6, y: 4.2 },
  { x: -4.6, y: -4.2 },
]

export const GroundPourTraceEntryStitchingCircuit = () => (
  <board width="32mm" height="20mm">
    <pcbnotetext
      pcbX={0}
      pcbY={9}
      fontSize={0.48}
      text="A local GND pour covers only two capacitor pads and their entering ground trace"
    />
    <net name="GND" isGroundNet />

    <chip name="U1" footprint="qfp16" pcbX={-11} pcbY={0} />
    <pinheader
      name="J1"
      pinCount={2}
      pcbX={13}
      pcbY={0}
      connections={{ pin1: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="0805"
      pcbX={-5}
      pcbY={2}
      connections={{ pin2: "net.GND" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0805"
      pcbX={-5}
      pcbY={-2}
      connections={{ pin2: "net.GND" }}
    />

    <trace name="GND_ENTRY" from=".J1 > .pin1" to="net.GND" thickness="0.6mm" />
    <trace
      name="SIGNAL_C1"
      from=".U1 > .pin5"
      to=".C1 > .pin1"
      thickness="0.25mm"
    />
    <trace
      name="SIGNAL_C2"
      from=".U1 > .pin6"
      to=".C2 > .pin1"
      thickness="0.25mm"
    />
    <trace
      name="SUPPLY"
      from=".U1 > .pin1"
      to=".J1 > .pin2"
      thickness="0.4mm"
    />

    <copperpour
      connectsTo="net.GND"
      layer="top"
      clearance="0.3mm"
      outline={traceEntryGroundPourOutline}
    />
    <copperpour
      connectsTo="net.GND"
      layer="bottom"
      clearance="0.3mm"
      outline={traceEntryGroundPourOutline}
    />
  </board>
)
