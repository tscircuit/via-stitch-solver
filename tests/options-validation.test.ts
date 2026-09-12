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
