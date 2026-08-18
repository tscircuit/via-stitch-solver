import type { BRepShape, Point } from "circuit-json"

interface FenceSegment {
  start: Point
  end: Point
  length: number
}

const getRingSegments = (shape: BRepShape): FenceSegment[] => {
  const vertices = shape.outer_ring.vertices
  if (vertices.length < 2) return []

  const segments: FenceSegment[] = []
  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex++) {
    const start = vertices[vertexIndex]!
    const end = vertices[(vertexIndex + 1) % vertices.length]!
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length > 0) segments.push({ start, end, length })
  }
  return segments
}

const getCanonicalOuterRingKey = (shape: BRepShape) => {
  const vertexKeys = shape.outer_ring.vertices.map(
    (vertex) =>
      `${vertex.x.toFixed(9)},${vertex.y.toFixed(9)},${(vertex.bulge ?? 0).toFixed(9)}`,
  )
  if (vertexKeys.length === 0) return ""

  let canonicalKey: string | undefined
  for (let startIndex = 0; startIndex < vertexKeys.length; startIndex++) {
    const candidateKey = vertexKeys
      .slice(startIndex)
      .concat(vertexKeys.slice(0, startIndex))
      .join(";")
    if (canonicalKey === undefined || candidateKey < canonicalKey) {
      canonicalKey = candidateKey
    }
  }
  return canonicalKey!
}

const getOffsetCornerCandidateCenters = ({
  shape,
  inset,
}: {
  shape: BRepShape
  inset: number
}) => {
  const vertices = shape.outer_ring.vertices
  if (vertices.length < 3) return []

  const candidateCenters: Point[] = []
  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex++) {
    const previous =
      vertices[(vertexIndex - 1 + vertices.length) % vertices.length]!
    const current = vertices[vertexIndex]!
    const next = vertices[(vertexIndex + 1) % vertices.length]!
    const previousDirection = {
      x: current.x - previous.x,
      y: current.y - previous.y,
    }
    const nextDirection = {
      x: next.x - current.x,
      y: next.y - current.y,
    }
    const previousLength = Math.hypot(previousDirection.x, previousDirection.y)
    const nextLength = Math.hypot(nextDirection.x, nextDirection.y)
    if (previousLength === 0 || nextLength === 0) continue

    const previousUnit = {
      x: previousDirection.x / previousLength,
      y: previousDirection.y / previousLength,
    }
    const nextUnit = {
      x: nextDirection.x / nextLength,
      y: nextDirection.y / nextLength,
    }
    const previousOffsetPoint = {
      x: current.x + previousUnit.y * inset,
      y: current.y - previousUnit.x * inset,
    }
    const nextOffsetPoint = {
      x: current.x + nextUnit.y * inset,
      y: current.y - nextUnit.x * inset,
    }
    const directionCrossProduct =
      previousUnit.x * nextUnit.y - previousUnit.y * nextUnit.x
    if (Math.abs(directionCrossProduct) < 1e-10) continue

    const offsetPointDelta = {
      x: nextOffsetPoint.x - previousOffsetPoint.x,
      y: nextOffsetPoint.y - previousOffsetPoint.y,
    }
    const previousLineInterpolation =
      (offsetPointDelta.x * nextUnit.y - offsetPointDelta.y * nextUnit.x) /
      directionCrossProduct
    candidateCenters.push({
      x: previousOffsetPoint.x + previousUnit.x * previousLineInterpolation,
      y: previousOffsetPoint.y + previousUnit.y * previousLineInterpolation,
    })
  }

  return candidateCenters
}

const getRingFenceCandidateCenters = ({
  shape,
  pitch,
  inset,
}: {
  shape: BRepShape
  pitch: number
  inset: number
}) => {
  const segments = getRingSegments(shape)
  const perimeter = segments.reduce(
    (totalLength, segment) => totalLength + segment.length,
    0,
  )
  if (perimeter === 0) return []

  const candidateCount = Math.max(1, Math.ceil(perimeter / pitch))
  const actualPitch = perimeter / candidateCount
  // Prefer explicit offset-corner candidates so the fence does not develop a
  // large gap where two sampled edges meet. Invalid concave-corner mitres are
  // discarded later by the shared copper-containment checks.
  const candidateCenters = getOffsetCornerCandidateCenters({ shape, inset })
  let segmentIndex = 0
  let distanceAtSegmentStart = 0

  for (
    let candidateIndex = 0;
    candidateIndex < candidateCount;
    candidateIndex++
  ) {
    const distanceAlongRing = (candidateIndex + 0.5) * actualPitch
    while (
      segmentIndex < segments.length - 1 &&
      distanceAlongRing >
        distanceAtSegmentStart + segments[segmentIndex]!.length
    ) {
      distanceAtSegmentStart += segments[segmentIndex]!.length
      segmentIndex += 1
    }

    const segment = segments[segmentIndex]!
    const distanceAlongSegment = distanceAlongRing - distanceAtSegmentStart
    const interpolation = distanceAlongSegment / segment.length
    const segmentX = segment.end.x - segment.start.x
    const segmentY = segment.end.y - segment.start.y
    const boundaryPoint = {
      x: segment.start.x + segmentX * interpolation,
      y: segment.start.y + segmentY * interpolation,
    }

    // Circuit JSON outer rings are clockwise, so the right-hand normal points
    // into the copper island.
    const inwardNormal = {
      x: segmentY / segment.length,
      y: -segmentX / segment.length,
    }
    candidateCenters.push({
      x: boundaryPoint.x + inwardNormal.x * inset,
      y: boundaryPoint.y + inwardNormal.y * inset,
    })
  }

  return candidateCenters
}

export const getFenceCandidateCenters = ({
  shapeSets,
  pitch,
  inset,
}: {
  shapeSets: BRepShape[][]
  pitch: number
  inset: number
}) => {
  const visitedOuterRings = new Set<string>()
  const candidateCenters: Point[] = []

  for (const shapes of shapeSets) {
    for (const shape of shapes) {
      const outerRingKey = getCanonicalOuterRingKey(shape)
      if (visitedOuterRings.has(outerRingKey)) continue
      visitedOuterRings.add(outerRingKey)
      candidateCenters.push(
        ...getRingFenceCandidateCenters({ shape, pitch, inset }),
      )
    }
  }

  return candidateCenters
}
