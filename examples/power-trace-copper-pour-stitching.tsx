export const powerCopperPourOutline = [
  { x: -10, y: -5 },
  { x: 9, y: -5 },
  { x: 9, y: 5 },
  { x: -10, y: 5 },
  { x: -10, y: -5 },
]

export const PowerTraceCopperPourStitchingCircuit = () => (
  <board width="34mm" height="22mm">
    <pcbnotetext
      pcbX={0}
      pcbY={9.6}
      fontSize={0.5}
      text="Thick top-layer VCC trace stitched to an overlapping bottom-layer VCC pour"
    />
    <net name="VCC" isPowerNet />
    <net name="GND" isGroundNet />

    <pinheader name="J1" pinCount={2} pcbX={-13} pcbY={0} />
    <chip
      name="U1"
      footprint="qfn32"
      pcbX={12}
      pcbY={1}
      connections={{ pin2: "net.GND", pin3: ".R1 > .pin1" }}
    />
    <capacitor
      name="C1"
      capacitance="10uF"
      footprint="1206"
      pcbX={-5}
      pcbY={-7}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <capacitor
      name="C2"
      capacitance="100nF"
      footprint="0603"
      pcbX={6}
      pcbY={7}
      connections={{ pin1: "net.VCC", pin2: "net.GND" }}
    />
    <resistor
      name="R1"
      resistance="10k"
      footprint="0805"
      pcbX={12}
      pcbY={-6}
      connections={{ pin2: "net.GND" }}
    />

    <trace
      name="VCC_MAIN"
      path={[".J1 > .pin1", "net.VCC", ".U1 > .pin1"]}
      thickness="1.2mm"
      pcbPathRelativeTo=".J1 > .pin1"
      pcbPath={[
        { x: 4, y: 0 },
        { x: 8, y: 3 },
        { x: 16, y: 3 },
        { x: 20, y: 1 },
      ]}
    />

    <copperpour
      connectsTo="net.VCC"
      layer="bottom"
      clearance="0.3mm"
      outline={powerCopperPourOutline}
    />
  </board>
)
