import type {
  LayerRef,
  PcbTrace,
  PcbTraceRoutePointWire,
  Point,
} from "circuit-json"

interface OffsetSegment {
  start: Point
  end: Point
  direction: Point
  length: number
  normal: Point
  offset: number
}

const POINT_EPSILON = 1e-9
const MAX_MITER_MULTIPLIER = 4

const isSamePoint = (first: Point, second: Point) =>
  Math.hypot(first.x - second.x, first.y - second.y) <= POINT_EPSILON

const getWireRuns = ({
  pcbTrace,
  layers,
}: {
  pcbTrace: PcbTrace
  layers: readonly [LayerRef, LayerRef]
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
      !layers.some((layer) => String(layer) === String(routePoint.layer))
    ) {
      commitRun()
      continue
    }

    if (
      currentRun.length > 0 &&
      String(currentRun[currentRun.length - 1]!.layer) !==
        String(routePoint.layer)
    ) {
      commitRun()
    }
    currentRun.push(routePoint)
  }
  commitRun()

  return runs
}

const getOffsetSegments = ({
  wireRun,
  side,
  traceOffset,
}: {
  wireRun: PcbTraceRoutePointWire[]
  side: -1 | 1
  traceOffset: number
}) => {
  const segments: OffsetSegment[] = []
  for (let pointIndex = 0; pointIndex < wireRun.length - 1; pointIndex++) {
    const start = wireRun[pointIndex]!
    const end = wireRun[pointIndex + 1]!
    const delta = { x: end.x - start.x, y: end.y - start.y }
    const length = Math.hypot(delta.x, delta.y)
    if (length <= POINT_EPSILON) continue

    const direction = { x: delta.x / length, y: delta.y / length }
    const normal = {
      x: -direction.y * side,
      y: direction.x * side,
    }
    // Use the widest endpoint so a width change cannot pull the fence inside
    // either adjoining portion of trace copper.
    const offset = Math.max(start.width, end.width) / 2 + traceOffset
    segments.push({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      direction,
      length,
      normal,
      offset,
    })
  }
  return segments
}

const offsetPoint = (point: Point, segment: OffsetSegment) => ({
  x: point.x + segment.normal.x * segment.offset,
  y: point.y + segment.normal.y * segment.offset,
})

const getOffsetCorner = (
  previous: OffsetSegment,
  next: OffsetSegment,
): Point => {
  const corner = previous.end
  const previousOffsetCorner = offsetPoint(corner, previous)
  const nextOffsetCorner = offsetPoint(corner, next)
  const cross =
    previous.direction.x * next.direction.y -
    previous.direction.y * next.direction.x

  if (Math.abs(cross) <= POINT_EPSILON) {
    return {
      x: (previousOffsetCorner.x + nextOffsetCorner.x) / 2,
      y: (previousOffsetCorner.y + nextOffsetCorner.y) / 2,
    }
  }

  const offsetDelta = {
    x: nextOffsetCorner.x - previousOffsetCorner.x,
    y: nextOffsetCorner.y - previousOffsetCorner.y,
  }
  const interpolation =
    (offsetDelta.x * next.direction.y - offsetDelta.y * next.direction.x) /
    cross
  const intersection = {
    x: previousOffsetCorner.x + previous.direction.x * interpolation,
    y: previousOffsetCorner.y + previous.direction.y * interpolation,
  }
  const maximumMiter =
    Math.max(previous.offset, next.offset) * MAX_MITER_MULTIPLIER

  if (
    Math.hypot(intersection.x - corner.x, intersection.y - corner.y) <=
    maximumMiter
  ) {
    return intersection
  }

  // Very acute turns create impractically long mitres. Beveling the guide at
  // the average of the adjoining offset points keeps candidates local.
  return {
    x: (previousOffsetCorner.x + nextOffsetCorner.x) / 2,
    y: (previousOffsetCorner.y + nextOffsetCorner.y) / 2,
  }
}

const getOffsetPolyline = ({
  wireRun,
  side,
  traceOffset,
}: {
  wireRun: PcbTraceRoutePointWire[]
  side: -1 | 1
  traceOffset: number
}) => {
  const segments = getOffsetSegments({ wireRun, side, traceOffset })
  if (segments.length === 0) return []

  const points: Point[] = [offsetPoint(segments[0]!.start, segments[0]!)]
  for (let segmentIndex = 1; segmentIndex < segments.length; segmentIndex++) {
    points.push(
      getOffsetCorner(segments[segmentIndex - 1]!, segments[segmentIndex]!),
    )
  }
  points.push(
    offsetPoint(
      segments[segments.length - 1]!.end,
      segments[segments.length - 1]!,
    ),
  )
  return points
}

const samplePolyline = (points: Point[], pitch: number) => {
  if (points.length < 2) return points

  const candidateCenters: Point[] = [points[0]!]
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
    const start = points[pointIndex]!
    const end = points[pointIndex + 1]!
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

export const getFenceCandidateCenters = ({
  pcbTraces,
  layers,
  pitch,
  traceOffset,
}: {
  pcbTraces: PcbTrace[]
  layers: readonly [LayerRef, LayerRef]
  pitch: number
  traceOffset: number
}) => {
  const candidateCenters: Point[] = []
  const visitedCenters = new Set<string>()

  for (const pcbTrace of pcbTraces) {
    for (const wireRun of getWireRuns({ pcbTrace, layers })) {
      for (const side of [-1, 1] as const) {
        const offsetPolyline = getOffsetPolyline({
          wireRun,
          side,
          traceOffset,
        })
        for (const center of samplePolyline(offsetPolyline, pitch)) {
          const key = `${center.x.toFixed(8)},${center.y.toFixed(8)}`
          if (visitedCenters.has(key)) continue
          visitedCenters.add(key)
          candidateCenters.push(center)
        }
      }
    }
  }

  return candidateCenters
}
