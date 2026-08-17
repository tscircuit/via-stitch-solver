import type { BRepShape, Point } from "circuit-json"

const POINT_EPSILON = 1e-8

const isPointOnSegment = (point: Point, start: Point, end: Point) => {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y)
  if (Math.abs(cross) > POINT_EPSILON) return false

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y)
  if (dot < -POINT_EPSILON) return false

  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2
  return dot <= squaredLength + POINT_EPSILON
}

const isPointInRing = (
  point: Point,
  ring: { vertices: Array<{ x: number; y: number }> },
) => {
  let isInside = false
  for (
    let currentIndex = 0, previousIndex = ring.vertices.length - 1;
    currentIndex < ring.vertices.length;
    previousIndex = currentIndex++
  ) {
    const current = ring.vertices[currentIndex]!
    const previous = ring.vertices[previousIndex]!
    if (isPointOnSegment(point, previous, current)) return true

    const crossesRay =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    if (crossesRay) isInside = !isInside
  }
  return isInside
}

const isPointInShape = (point: Point, shape: BRepShape) =>
  isPointInRing(point, shape.outer_ring) &&
  !shape.inner_rings.some((innerRing) => isPointInRing(point, innerRing))

const isPointInShapeUnion = (point: Point, shapes: BRepShape[]) =>
  shapes.some((shape) => isPointInShape(point, shape))

export const getShapeUnionBounds = (shapes: BRepShape[]) => {
  const vertices = shapes.flatMap((shape) => shape.outer_ring.vertices)
  if (vertices.length === 0) return undefined

  return {
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
  }
}

export const isViaAnnulusInsideShapeUnion = ({
  center,
  radius,
  shapes,
}: {
  center: Point
  radius: number
  shapes: BRepShape[]
}) => {
  const samplePoints: Point[] = [center]
  for (let sampleIndex = 0; sampleIndex < 32; sampleIndex++) {
    const angle = (sampleIndex / 32) * Math.PI * 2
    samplePoints.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return samplePoints.every((samplePoint) =>
    isPointInShapeUnion(samplePoint, shapes),
  )
}
