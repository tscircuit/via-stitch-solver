import type {
  BRepShape,
  LayerRef,
  PcbTrace,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"
import { isPointInShapeUnion } from "./brep-point-containment"

const POINT_EPSILON = 1e-9
const ANNULUS_SAMPLE_COUNT = 32

const isSamePoint = (first: Point, second: Point) =>
  Math.hypot(first.x - second.x, first.y - second.y) <= POINT_EPSILON

export const getTraceWireRuns = ({
  pcbTrace,
  layer,
}: {
  pcbTrace: PcbTrace
  layer: LayerRef
}) => {
  const runs: PcbTraceRoutePointWire[][] = []
  let currentRun: PcbTraceRoutePointWire[] = []

  const commitRun = () => {
    const distinctPoints = currentRun.filter(
      (point, pointIndex) =>
        pointIndex === 0 || !isSamePoint(point, currentRun[pointIndex - 1]!),
    )
    if (distinctPoints.length >= 2) runs.push(distinctPoints)
    currentRun = []
  }

  for (const routePoint of pcbTrace.route) {
    if (
      routePoint.route_type !== "wire" ||
      String(routePoint.layer) !== String(layer)
    ) {
      commitRun()
      continue
    }
    currentRun.push(routePoint)
  }
  commitRun()

  return runs
}

const sampleWireRun = (wireRun: PcbTraceRoutePointWire[], pitch: number) => {
  const candidateCenters: Point[] = [{ x: wireRun[0]!.x, y: wireRun[0]!.y }]

  for (let pointIndex = 0; pointIndex < wireRun.length - 1; pointIndex++) {
    const start = wireRun[pointIndex]!
    const end = wireRun[pointIndex + 1]!
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length <= POINT_EPSILON) continue

    const intervalCount = Math.max(1, Math.ceil(length / pitch))
    for (
      let intervalIndex = 1;
      intervalIndex <= intervalCount;
      intervalIndex++
    ) {
      const interpolation = intervalIndex / intervalCount
      candidateCenters.push({
        x: start.x + (end.x - start.x) * interpolation,
        y: start.y + (end.y - start.y) * interpolation,
      })
    }
  }

  return candidateCenters
}

export const getTraceCopperCandidateCenters = ({
  pcbTraces,
  layer,
  pitch,
}: {
  pcbTraces: PcbTrace[]
  layer: LayerRef
  pitch: number
}) => {
  const candidateCenters: Point[] = []
  const visitedCenters = new Set<string>()

  for (const pcbTrace of pcbTraces) {
    for (const wireRun of getTraceWireRuns({ pcbTrace, layer })) {
      for (const center of sampleWireRun(wireRun, pitch)) {
        const key = `${center.x.toFixed(8)},${center.y.toFixed(8)}`
        if (visitedCenters.has(key)) continue
        visitedCenters.add(key)
        candidateCenters.push(center)
      }
    }
  }

  return candidateCenters
}

const isPointInsideWireSegment = ({
  point,
  start,
  end,
}: {
  point: Point
  start: PcbTraceRoutePointWire
  end: PcbTraceRoutePointWire
}) => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const squaredLength = deltaX ** 2 + deltaY ** 2
  const interpolation =
    squaredLength <= POINT_EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
              squaredLength,
          ),
        )
  const nearestPoint = {
    x: start.x + deltaX * interpolation,
    y: start.y + deltaY * interpolation,
  }
  // Use the narrower endpoint as a conservative approximation if a route
  // segment changes width.
  const halfWidth = Math.min(start.width, end.width) / 2

  return (
    Math.hypot(point.x - nearestPoint.x, point.y - nearestPoint.y) <=
    halfWidth + POINT_EPSILON
  )
}

const isPointInsideTraceCopper = ({
  point,
  wireRuns,
}: {
  point: Point
  wireRuns: PcbTraceRoutePointWire[][]
}) =>
  wireRuns.some((wireRun) =>
    wireRun.some((start, pointIndex) => {
      const end = wireRun[pointIndex + 1]
      return end ? isPointInsideWireSegment({ point, start, end }) : false
    }),
  )

const getViaAnnulusSamplePoints = ({
  center,
  radius,
}: {
  center: Point
  radius: number
}) => {
  const samplePoints: Point[] = [center]
  for (let sampleIndex = 0; sampleIndex < ANNULUS_SAMPLE_COUNT; sampleIndex++) {
    const angle = (sampleIndex / ANNULUS_SAMPLE_COUNT) * Math.PI * 2
    samplePoints.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return samplePoints
}

export const isViaAnnulusInsideTraceOrShapeUnion = ({
  center,
  radius,
  pcbTrace,
  layer,
  shapes,
}: {
  center: Point
  radius: number
  pcbTrace: PcbTrace
  layer: LayerRef
  shapes: BRepShape[]
}) => {
  const wireRuns = getTraceWireRuns({ pcbTrace, layer })
  if (wireRuns.length === 0) return false

  return getViaAnnulusSamplePoints({ center, radius }).every(
    (samplePoint) =>
      isPointInsideTraceCopper({ point: samplePoint, wireRuns }) ||
      isPointInShapeUnion(samplePoint, shapes),
  )
}

export const isViaAnnulusInsideTraceCopper = ({
  center,
  radius,
  pcbTrace,
  layer,
}: {
  center: Point
  radius: number
  pcbTrace: PcbTrace
  layer: LayerRef
}) =>
  isViaAnnulusInsideTraceOrShapeUnion({
    center,
    radius,
    pcbTrace,
    layer,
    shapes: [],
  })
