import { expect, test } from "bun:test"
import { ViaStitchSolver } from "lib/index"

const rectangularPour = (
  layer: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
) => ({
  type: "pcb_copper_pour",
  pcb_copper_pour_id: `pour_${layer}`,
  shape: "brep",
  layer,
  source_net_id: "net_gnd",
  covered_with_solder_mask: false,
  brep_shape: {
    outer_ring: {
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
    },
    inner_rings: [],
  },
})

test("does not drop on-grid columns when division and multiplication round differently", () => {
  // With origin -5.9 and pitch 0.3 the overlap x range is [-16.4, -15.9],
  // whose on-grid coordinates are -16.4 (index -35) and -16.1 (index -34).
  // Math.ceil((-16.4 + 5.9) / 0.3) is -34 because the quotient lands one
  // ulp above -35, while the emitted coordinate -5.9 + -35 * 0.3 is -16.4
  // exactly, inside the range. The boundary column must not be lost.
  const solver = new ViaStitchSolver({
    circuitJson: [
      rectangularPour("top", -16.9, -15.4, 0, 1.4),
      rectangularPour("bottom", -16.9, -15.4, 0, 1.4),
    ] as any,
    options: { gridOrigin: { x: -5.9, y: 0 }, viaStitchPitch: 0.3 },
  })
  solver.solve()
  const positions = solver
    .getOutput()
    .pcbVias.map((via) => [via.x, via.y] as const)
    .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
  // The -16.1 column and the second grid row sit inside the default
  // 0.8 mm minimum via separation, so only the boundary via is emitted.
  expect(positions).toEqual([[-16.4, 0.6]])
})
