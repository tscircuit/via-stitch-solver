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

  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: {
          stitchingPattern: "fence",
          viaOuterDiameter: 0.6,
          pourEdgeClearance: 0.2,
          fenceInset: 0.49,
        },
      }),
  ).toThrow("fenceInset must be at least 0.5mm")

  expect(
    () =>
      new ViaStitchSolver({
        circuitJson: [],
        options: {
          // @ts-expect-error Runtime validation also protects JavaScript callers.
          stitchingPattern: "rings",
        },
      }),
  ).toThrow('stitchingPattern must be either "grid" or "fence"')
})
