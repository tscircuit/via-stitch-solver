export const traceEntryGroundPourOutline = [
  { x: -2, y: -10 },
  { x: 16, y: -10 },
  { x: 16, y: 10 },
  { x: -2, y: 10 },
  { x: -2, y: -10 },
]

export const GroundPourTraceEntryStitchingCircuit = () => (
  <board width="36mm" height="24mm">
    <pcbnotetext
      pcbX={0}
      pcbY={11}
      fontSize={0.48}
      text="Signal and power traces cross a stitched top/bottom GND pour"
    />
    <net name="GND" isGroundNet />
    <net name="VCC" isPowerNet />

    <chip name="U1" footprint="qfp16" pcbX={-12} pcbY={0} />
    <chip
      name="U2"
      footprint="soic8"
      pcbX={9}
      pcbY={0}
      connections={{ pin4: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="1uF"
      footprint="0805"
      pcbX={-6}
      pcbY={6}
      connections={{ pin1: "net.VCC" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0603"
      pcbX={-6}
      pcbY={-6}
      connections={{ pin1: "net.VCC" }}
    />
    <resistor name="R1" resistance="10k" footprint="0402" pcbX={4} pcbY={8} />
    <resistor
      name="R2"
      resistance="4.7k"
      footprint="1206"
      pcbX={10}
      pcbY={-7}
    />

    <trace
      name="SIGNAL_A"
      from=".U1 > .pin5"
      to=".U2 > .pin1"
      thickness="0.25mm"
      pcbPathRelativeTo=".U1 > .pin5"
      pcbPath={[
        { x: 4, y: 0 },
        { x: 7, y: 3 },
        { x: 14, y: 3 },
      ]}
    />
    <trace
      name="SIGNAL_B"
      from=".U1 > .pin6"
      to=".U2 > .pin2"
      thickness="0.25mm"
      pcbPathRelativeTo=".U1 > .pin6"
      pcbPath={[
        { x: 4, y: 0 },
        { x: 7, y: -3 },
        { x: 14, y: -3 },
      ]}
    />
    <trace
      name="VCC_MAIN"
      path={[".U1 > .pin1", "net.VCC", ".U2 > .pin3"]}
      thickness="0.6mm"
      pcbPathRelativeTo=".U1 > .pin1"
      pcbPath={[
        { x: 4, y: 0 },
        { x: 8, y: 5 },
        { x: 15, y: 5 },
      ]}
    />
    <trace
      name="GND_C1_ENTRY"
      from=".C1 > .pin2"
      to="net.GND"
      thickness="0.3mm"
      pcbPathRelativeTo=".C1 > .pin2"
      pcbPath={[
        { x: 3, y: 0 },
        { x: 6, y: 0 },
        { x: 8, y: -1 },
      ]}
    />
    <trace
      name="GND_C2_ENTRY"
      from=".C2 > .pin2"
      to="net.GND"
      thickness="0.3mm"
      pcbPathRelativeTo=".C2 > .pin2"
      pcbPath={[
        { x: 3, y: 0 },
        { x: 6, y: 0 },
        { x: 8, y: 1 },
      ]}
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
