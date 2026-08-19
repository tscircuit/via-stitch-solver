export const powerEntryPourOutline = [
  { x: -1.5, y: -4.2 },
  { x: 4.6, y: -4.2 },
  { x: 4.6, y: 4.2 },
  { x: -1.5, y: 4.2 },
  { x: -1.5, y: -4.2 },
]

export const PowerPolygonEntryStitchingCircuit = () => (
  <board width="32mm" height="20mm">
    <pcbnotetext
      pcbX={0}
      pcbY={9}
      fontSize={0.48}
      text="A local VCC pour covers only two capacitor pads and their entering power trace"
    />
    <net name="VCC" isPowerNet />

    <pinheader
      name="J1"
      pinCount={2}
      pcbX={-13}
      pcbY={0}
      connections={{ pin1: "net.VCC" }}
    />
    <chip name="U1" footprint="qfp16" pcbX={11} pcbY={0} />
    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="0805"
      pcbX={5}
      pcbY={2}
      connections={{ pin1: "net.VCC" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0805"
      pcbX={5}
      pcbY={-2}
      connections={{ pin1: "net.VCC" }}
    />

    <trace name="VCC_ENTRY" from=".J1 > .pin1" to="net.VCC" thickness="0.6mm" />
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
      name="RETURN"
      from=".J1 > .pin2"
      to=".U1 > .pin1"
      thickness="0.4mm"
    />

    <copperpour
      connectsTo="net.VCC"
      layer="top"
      clearance="0.3mm"
      outline={powerEntryPourOutline}
    />
    <copperpour
      connectsTo="net.VCC"
      layer="bottom"
      clearance="0.3mm"
      outline={powerEntryPourOutline}
    />
  </board>
)
