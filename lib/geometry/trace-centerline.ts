import type { PcbTrace, Point } from "circuit-json"

const POINT_EPSILON = 1e-8

const arePointsEqual = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= POINT_EPSILON

const isCollinearAndForward = (a: Point, b: Point, c: Point) => {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const scale = Math.max(1, Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y))
  const cross = ab.x * bc.y - ab.y * bc.x
  const dot = ab.x * bc.x + ab.y * bc.y
  return Math.abs(cross) <= POINT_EPSILON * scale && dot >= 0
}

/**
 * Returns board-world points in millimetres, with +X right and +Y up. Route
 * layer changes at a fixed XY position are represented only once.
 */
export const getTraceCenterline = (pcbTrace: PcbTrace): Point[] => {
  const routePoints: Point[] = []

  for (const routePoint of pcbTrace.route) {
    if (routePoint.route_type === "through_pad") {
      routePoints.push(routePoint.start, routePoint.end)
    } else {
      routePoints.push({ x: routePoint.x, y: routePoint.y })
    }
  }

  const deduplicated: Point[] = []
  for (const routePoint of routePoints) {
    const previous = deduplicated.at(-1)
    if (!previous || !arePointsEqual(previous, routePoint)) {
      deduplicated.push(routePoint)
    }
  }

  if (deduplicated.length <= 2) return deduplicated

  const simplified: Point[] = [deduplicated[0]!]
  for (let pointIndex = 1; pointIndex < deduplicated.length - 1; pointIndex++) {
    const previous = simplified.at(-1)!
    const current = deduplicated[pointIndex]!
    const next = deduplicated[pointIndex + 1]!
    if (!isCollinearAndForward(previous, current, next)) {
      simplified.push(current)
    }
  }
  simplified.push(deduplicated.at(-1)!)

  return simplified
}

export const getMaximumWireWidth = (pcbTrace: PcbTrace) => {
  let maximumWireWidth = 0
  for (const routePoint of pcbTrace.route) {
    if (routePoint.route_type === "wire") {
      maximumWireWidth = Math.max(maximumWireWidth, routePoint.width)
    } else if (routePoint.route_type === "through_pad") {
      maximumWireWidth = Math.max(maximumWireWidth, routePoint.width)
    }
  }
  return maximumWireWidth
}

export const getTopBottomTransitionCount = (pcbTrace: PcbTrace) => {
  let transitionCount = 0
  for (const routePoint of pcbTrace.route) {
    if (
      routePoint.route_type === "via" &&
      ((routePoint.from_layer === "top" && routePoint.to_layer === "bottom") ||
        (routePoint.from_layer === "bottom" && routePoint.to_layer === "top"))
    ) {
      transitionCount += 1
    }
  }
  return transitionCount
}

export const sampleCenterline = ({
  centerline,
  pitch,
  endpointClearance,
}: {
  centerline: Point[]
  pitch: number
  endpointClearance: number
}): Point[] => {
  const segments: Array<{ start: Point; end: Point; length: number }> = []
  let totalLength = 0

  for (let pointIndex = 1; pointIndex < centerline.length; pointIndex++) {
    const start = centerline[pointIndex - 1]!
    const end = centerline[pointIndex]!
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length <= POINT_EPSILON) continue
    segments.push({ start, end, length })
    totalLength += length
  }

  if (segments.length === 0 || totalLength <= endpointClearance * 2) return []

  const samples: Point[] = []
  for (
    let targetDistance = endpointClearance;
    targetDistance <= totalLength - endpointClearance + POINT_EPSILON;
    targetDistance += pitch
  ) {
    let traversedLength = 0
    for (const segment of segments) {
      if (targetDistance <= traversedLength + segment.length + POINT_EPSILON) {
        const ratio = Math.min(
          1,
          Math.max(0, (targetDistance - traversedLength) / segment.length),
        )
        samples.push({
          x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
          y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        })
        break
      }
      traversedLength += segment.length
    }
  }

  return samples
}
