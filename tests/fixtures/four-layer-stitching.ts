import type { AnyCircuitElement, LayerRef } from "circuit-json"
export function fourLayerStitchingFixture(
  outerPair = false,
): AnyCircuitElement[] {
  const pour = (
    id: string,
    layer: LayerRef,
    net: string,
    x1 = -4,
    y1 = -4,
    x2 = 4,
    y2 = 4,
  ) => ({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: id,
    shape: "brep",
    layer,
    source_net_id: net,
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ],
      },
      inner_rings: [],
    },
  })
  return [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      width: 10,
      height: 10,
      center: { x: 0, y: 0 },
      num_layers: 4,
    },
    { type: "source_net", source_net_id: "gnd", name: "GND", is_ground: true },
    { type: "source_net", source_net_id: "power", name: "VCC" },
    pour("gnd-a", outerPair ? "top" : "inner1", "gnd"),
    pour("gnd-b", "bottom", "gnd"),
    pour("foreign-pour", outerPair ? "inner1" : "top", "power", -1, -2, 1, -1),
    {
      type: "pcb_trace",
      pcb_trace_id: "foreign-trace",
      source_trace_id: "signal",
      route: [
        { route_type: "wire", x: -3, y: 0, layer: "inner2", width: 0.2 },
        { route_type: "wire", x: 3, y: 0, layer: "inner2", width: 0.2 },
      ],
    },
  ] as AnyCircuitElement[]
}
