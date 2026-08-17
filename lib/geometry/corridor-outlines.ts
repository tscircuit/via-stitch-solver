import { getManifoldModuleSync } from "@tscircuit/manifold-2d"
import type { PcbBoard, Point } from "circuit-json"

const GEOMETRY_SCALE = 1_000_000
const CIRCLE_SEGMENTS = 24

type Polygon = Point[]

const getSignedArea = (polygon: Polygon) => {
  let area = 0
  for (let pointIndex = 0; pointIndex < polygon.length; pointIndex++) {
    const current = polygon[pointIndex]!
    const next = polygon[(pointIndex + 1) % polygon.length]!
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const normalizePolygon = (polygon: Polygon): Polygon =>
  getSignedArea(polygon) >= 0 ? polygon : [...polygon].reverse()

const toScaledPolygon = (polygon: Polygon) =>
  normalizePolygon(polygon).map(
    (point) =>
      [point.x * GEOMETRY_SCALE, point.y * GEOMETRY_SCALE] as [number, number],
  )

const fromScaledPolygon = (polygon: ArrayLike<ArrayLike<number>>): Polygon =>
  Array.from(polygon, (point) => ({
    x: Number(point[0]) / GEOMETRY_SCALE,
    y: Number(point[1]) / GEOMETRY_SCALE,
  }))

const createCirclePolygon = (center: Point, radius: number): Polygon => {
  const polygon: Polygon = []
  for (let pointIndex = 0; pointIndex < CIRCLE_SEGMENTS; pointIndex++) {
    const angle = (pointIndex / CIRCLE_SEGMENTS) * Math.PI * 2
    polygon.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return polygon
}

const createSegmentPolygon = (start: Point, end: Point, width: number) => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.hypot(deltaX, deltaY)
  if (length === 0) return []

  const offsetX = (-deltaY / length) * (width / 2)
  const offsetY = (deltaX / length) * (width / 2)
  return [
    { x: start.x + offsetX, y: start.y + offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: start.x - offsetX, y: start.y - offsetY },
  ]
}

const getBoardOutline = (pcbBoard: PcbBoard): Polygon => {
  if (pcbBoard.outline && pcbBoard.outline.length >= 3) {
    return pcbBoard.outline
  }
  if (pcbBoard.width === undefined || pcbBoard.height === undefined) {
    throw new Error("pcb_board requires width/height or an outline")
  }

  const halfWidth = pcbBoard.width / 2
  const halfHeight = pcbBoard.height / 2
  return [
    { x: pcbBoard.center.x - halfWidth, y: pcbBoard.center.y - halfHeight },
    { x: pcbBoard.center.x + halfWidth, y: pcbBoard.center.y - halfHeight },
    { x: pcbBoard.center.x + halfWidth, y: pcbBoard.center.y + halfHeight },
    { x: pcbBoard.center.x - halfWidth, y: pcbBoard.center.y + halfHeight },
  ]
}

/**
 * Returns board-world polygon outlines in millimetres. The full routed
 * centerline is unioned into a round-ended corridor, clipped to the board, and
 * inset by the requested board-edge margin.
 */
export const createCorridorOutlines = ({
  centerline,
  width,
  pcbBoard,
  boardEdgeMargin,
}: {
  centerline: Point[]
  width: number
  pcbBoard: PcbBoard
  boardEdgeMargin: number
}): Polygon[] => {
  const manifold = getManifoldModuleSync()
  if (!manifold) {
    throw new Error(
      "Manifold geometry is not initialized. Call initializeViaStitchSolver() before solving.",
    )
  }

  const primitivePolygons: Polygon[] = centerline.map((point) =>
    createCirclePolygon(point, width / 2),
  )
  for (let pointIndex = 1; pointIndex < centerline.length; pointIndex++) {
    const segmentPolygon = createSegmentPolygon(
      centerline[pointIndex - 1]!,
      centerline[pointIndex]!,
      width,
    )
    if (segmentPolygon.length >= 3) primitivePolygons.push(segmentPolygon)
  }

  const primitiveSections = primitivePolygons.map((polygon) =>
    manifold.CrossSection.ofPolygons([toScaledPolygon(polygon)], "Positive"),
  )
  if (primitiveSections.length === 0) return []

  const corridorSection = manifold.CrossSection.compose(primitiveSections)
  const boardSection = manifold.CrossSection.ofPolygons(
    [toScaledPolygon(getBoardOutline(pcbBoard))],
    "Positive",
  )
  const insetBoardSection =
    boardEdgeMargin > 0
      ? boardSection.offset(-boardEdgeMargin * GEOMETRY_SCALE, "Miter", 2, 32)
      : boardSection
  const clippedCorridor = corridorSection.intersect(insetBoardSection)
  const outlines: Polygon[] = []

  for (const island of clippedCorridor.decompose()) {
    const rings = Array.from(island.toPolygons(), (polygon) =>
      fromScaledPolygon(polygon),
    )
    if (rings.length === 0) continue
    const outerRing = rings.reduce((largestRing, ring) =>
      Math.abs(getSignedArea(ring)) > Math.abs(getSignedArea(largestRing))
        ? ring
        : largestRing,
    )
    outlines.push(normalizePolygon(outerRing))
  }

  return outlines
}
