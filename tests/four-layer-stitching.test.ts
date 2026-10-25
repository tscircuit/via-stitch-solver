import { expect, test } from "bun:test"
import { ViaStitchSolver } from "lib/index"
import { fourLayerStitchingFixture } from "./fixtures/four-layer-stitching"
test("stitches inner-plane pairs with full-stack barrels clear of all traversed copper", () => {
  for (const outerPair of [false, true]) {
    for (const explicitLayers of [false, true]) {
      const circuitJson = fourLayerStitchingFixture(outerPair),
        before = JSON.stringify(circuitJson),
        solver = new ViaStitchSolver({
          circuitJson,
          options: {
            ...(explicitLayers
              ? {
                  layers: outerPair
                    ? (["top", "bottom"] as const)
                    : (["inner1", "bottom"] as const),
                }
              : {}),
            viaStitchPitch: 1,
            viaHoleDiameter: 0.3,
            viaOuterDiameter: 0.5,
            obstacleClearance: 0.2,
          },
        })
      solver.solve()
      expect(solver.solved).toBe(true)
      const vias = solver.getOutput().pcbVias
      expect(vias.length).toBeGreaterThan(0)
      for (const via of vias) {
        expect(via.layers).toEqual(["top", "inner1", "inner2", "bottom"])
        expect(via.from_layer).toBe("top")
        expect(via.to_layer).toBe("bottom")
        const dx = Math.max(Math.abs(via.x) - 3, 0)
        expect(Math.hypot(dx, via.y)).toBeGreaterThanOrEqual(
          0.25 + 0.1 + 0.2 - 1e-8,
        )
        const px = Math.max(-1 - via.x, via.x - 1, 0),
          py = Math.max(-2 - via.y, via.y + 1, 0)
        expect(Math.hypot(px, py)).toBeGreaterThanOrEqual(0.25 + 0.2 - 1e-8)
      }
      expect(JSON.stringify(circuitJson)).toBe(before)
    }
  }
})
