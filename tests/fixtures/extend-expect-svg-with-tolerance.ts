import { Resvg } from "@resvg/resvg-js"
import looksSame from "@tscircuit/image-utils/looks-same"
import { expect, type MatcherResult } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

type SvgSnapshotOptions = {
  diffThresholdPercent?: number
}

const renderSvgToPng = (svg: string): Uint8Array =>
  new Resvg(Buffer.from(svg)).render().asPng()

async function toMatchSvgSnapshotWithTolerance(
  // biome-ignore lint/suspicious/noExplicitAny: Bun does not expose matcher context types
  this: any,
  receivedMaybePromise: string | Promise<string>,
  testPathOriginal: string,
  svgName?: string,
  options?: SvgSnapshotOptions,
): Promise<MatcherResult> {
  const received = await receivedMaybePromise
  const testPath = testPathOriginal.replace(/\.test\.tsx?$/, "")
  const snapshotDirectory = path.join(path.dirname(testPath), "__snapshots__")
  const snapshotName = svgName
    ? `${path.basename(testPath)}-${svgName}.snap.svg`
    : `${path.basename(testPath)}.snap.svg`
  const snapshotPath = path.join(snapshotDirectory, snapshotName)
  const diffThresholdPercent = options?.diffThresholdPercent ?? 0

  if (diffThresholdPercent < 0 || !Number.isFinite(diffThresholdPercent)) {
    throw new TypeError("diffThresholdPercent must be a non-negative number")
  }

  if (!fs.existsSync(snapshotDirectory)) {
    fs.mkdirSync(snapshotDirectory, { recursive: true })
  }

  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, received)
    return {
      message: () => `Snapshot created at ${snapshotPath}`,
      pass: true,
    }
  }

  const existingSnapshot = fs.readFileSync(snapshotPath, "utf8")
  const receivedPng = renderSvgToPng(received)
  const existingPng = renderSvgToPng(existingSnapshot)
  const comparison = await looksSame(existingPng, receivedPng, {
    strict: false,
    tolerance: 2,
  })
  const totalPixels = comparison.totalPixels ?? 1
  const differentPixels = comparison.differentPixels ?? 0
  const diffPercent = (differentPixels / totalPixels) * 100
  const snapshotMatches =
    comparison.equal || diffPercent <= diffThresholdPercent

  const updateSnapshot =
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u") ||
    Boolean(process.env.BUN_UPDATE_SNAPSHOTS)
  const forceUpdateSnapshot = Boolean(process.env.FORCE_BUN_UPDATE_SNAPSHOTS)

  if (forceUpdateSnapshot) {
    fs.writeFileSync(snapshotPath, received)
    return {
      message: () => `Snapshot force-updated at ${snapshotPath}`,
      pass: true,
    }
  }

  if (snapshotMatches) {
    return {
      message: () =>
        `Snapshot matches within ${diffThresholdPercent}% tolerance`,
      pass: true,
    }
  }

  if (updateSnapshot) {
    fs.writeFileSync(snapshotPath, received)
    return {
      message: () => `Snapshot updated at ${snapshotPath}`,
      pass: true,
    }
  }

  const diffPath = snapshotPath.replace(".snap.svg", ".diff.png")
  const diffPng = await looksSame.createDiff({
    reference: existingPng,
    current: receivedPng,
    highlightColor: "#ff00ff",
    strict: false,
    tolerance: 2,
  })
  fs.writeFileSync(diffPath, diffPng)

  return {
    message: () =>
      `Snapshot does not match (diff ${diffPercent.toFixed(2)}%, tolerance ${diffThresholdPercent.toFixed(2)}%). Diff saved at ${diffPath}`,
    pass: false,
  }
}

expect.extend({
  // biome-ignore lint/suspicious/noExplicitAny: Bun's CustomMatcher uses unknown for received values
  toMatchSvgSnapshotWithTolerance: toMatchSvgSnapshotWithTolerance as any,
})

declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchSvgSnapshotWithTolerance(
      testPath: string,
      svgName?: string,
      options?: SvgSnapshotOptions,
    ): Promise<MatcherResult>
  }
}
