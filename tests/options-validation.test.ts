import { expect, test } from "bun:test"
import { ViaStitchSolver } from "lib/index"

test("rejects invalid viaStitchPitch values", () => {
  for (const viaStitchPitch of [0, -1, NaN, Infinity, -Infinity]) {
    expect(
      () =>
        new ViaStitchSolver({ circuitJson: [], options: { viaStitchPitch } }),
    ).toThrow("viaStitchPitch")
  }
})

test("rejects dimensions that cannot produce valid stitching geometry", () => {
  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: { viaStitchPitch: 0 },
      }),
  ).toThrow("viaStitchPitch")

  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: { pourEdgeClearance: -0.1 },
      }),
  ).toThrow("pourEdgeClearance")

  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: { obstacleClearance: -0.1 },
      }),
  ).toThrow("obstacleClearance")

  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: { viaHoleDiameter: 0.6, viaOuterDiameter: 0.6 },
      }),
  ).toThrow("viaHoleDiameter must be smaller than viaOuterDiameter")
})

test("skips stitching candidate positions where a small inner_ring cutout lies inside the via annulus", () => {
  const solver = new ViaStitchSolver({
    circuitJson: [
      {
        type: "source_net",
        source_net_id: "net_gnd",
        name: "GND",
        member_source_group_ids: [],
        is_ground: true,
      },
      {
        type: "pcb_copper_pour",
        pcb_copper_pour_id: "pour_top",
        layer: "top",
        shape: "brep",
        covered_with_solder_mask: false,
        source_net_id: "net_gnd",
        brep_shape: {
          outer_ring: {
            vertices: [
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ],
          },
          inner_rings: [
            {
              vertices: [
                { x: 0.15, y: 0.02 },
                { x: 0.25, y: 0.02 },
                { x: 0.25, y: 0.08 },
                { x: 0.15, y: 0.08 },
              ],
            },
          ],
        },
      },
      {
        type: "pcb_copper_pour",
        pcb_copper_pour_id: "pour_bottom",
        layer: "bottom",
        shape: "brep",
        covered_with_solder_mask: false,
        source_net_id: "net_gnd",
        brep_shape: {
          outer_ring: {
            vertices: [
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ],
          },
          inner_rings: [],
        },
      },
    ],
    options: {
      viaStitchPitch: 2,
      viaHoleDiameter: 0.3,
      viaOuterDiameter: 0.6,
      pourEdgeClearance: 0.2,
    },
  })

  solver.solve()
  expect(solver.getOutput().pcbVias).toHaveLength(0)
})
