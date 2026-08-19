export const powerEntryPourOutline = [
  { x: -1, y: -8 },
  { x: 14, y: -7 },
  { x: 14, y: 7 },
  { x: 4, y: 9 },
  { x: -1, y: 5 },
  { x: -1, y: -8 },
]

export const PowerPolygonEntryStitchingCircuit = () => (
  <board width="34mm" height="22mm">
    <pcbnotetext
      pcbX={0}
      pcbY={9.8}
      fontSize={0.5}
      text="VCC enters paired polygon pours with one entry via, not a corridor row"
    />
    <net name="VCC" isPowerNet />
    <net name="GND" isGroundNet />

    <pinheader name="J1" pinCount={2} pcbX={-13} pcbY={0} />
    <chip
      name="U1"
      footprint="soic8"
      pcbX={8}
      pcbY={0}
      connections={{ pin1: "net.VCC", pin4: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="1206"
      pcbX={-7}
      pcbY={-6}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0603"
      pcbX={6}
      pcbY={6}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <resistor
      name="R1"
      resistance="10k"
      footprint="0805"
      pcbX={11}
      pcbY={-5}
      connections={{ pin1: "U1.pin2", pin2: "net.GND" }}
    />

    <trace
      name="VCC_ENTRY"
      from=".J1 > .pin1"
      to="net.VCC"
      thickness="0.5mm"
      pcbPathRelativeTo=".J1 > .pin1"
      pcbPath={[
        { x: 4, y: 0 },
        { x: 8, y: 2 },
        { x: 12, y: 2 },
        { x: 16, y: 1 },
      ]}
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
