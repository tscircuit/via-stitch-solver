import { expect, test } from "bun:test"
import { ViaStitchSolver } from "lib/index"

test("rejects dimensions that cannot produce valid stitching geometry", () => {
  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: { viaPitch: 0 },
      }),
  ).toThrow("viaPitch")

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
        options: { viaHoleDiameter: 0.6, viaOuterDiameter: 0.6 },
      }),
  ).toThrow("viaHoleDiameter must be smaller than viaOuterDiameter")
})
