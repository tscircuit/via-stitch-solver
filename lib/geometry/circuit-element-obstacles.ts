import type {
  AnyCircuitElement,
  LayerRef,
  PcbComponent,
  PcbHole,
  PcbPlatedHole,
  PcbSmtPad,
  Point,
} from "circuit-json"

interface CircleObstacle {
  kind: "circle"
  center: Point
  radius: number
}

interface RectObstacle {
  kind: "rect"
  center: Point
  width: number
  height: number
  ccwRotation: number
}

interface PolygonObstacle {
  kind: "polygon"
  points: Point[]
}

type StitchingObstacle = CircleObstacle | RectObstacle | PolygonObstacle

const layerMatches = (layer: LayerRef, layers: readonly [LayerRef, LayerRef]) =>
  layers.some((candidateLayer) => String(candidateLayer) === String(layer))

const componentToObstacle = (
  component: PcbComponent,
): StitchingObstacle | undefined => {
  if (component.do_not_place || !component.obstructs_within_bounds) {
    return undefined
  }
  return {
    kind: "rect",
    center: component.center,
    width: component.width,
    height: component.height,
    ccwRotation: component.rotation,
  }
}

const smtPadToObstacle = (smtPad: PcbSmtPad): StitchingObstacle => {
  if (smtPad.shape === "circle") {
    return {
      kind: "circle",
      center: { x: smtPad.x, y: smtPad.y },
      radius: smtPad.radius,
    }
  }
  if (smtPad.shape === "polygon") {
    return { kind: "polygon", points: smtPad.points }
  }
  return {
    kind: "rect",
    center: { x: smtPad.x, y: smtPad.y },
    width: smtPad.width,
    height: smtPad.height,
    ccwRotation:
      smtPad.shape === "rotated_rect" || smtPad.shape === "rotated_pill"
        ? smtPad.ccw_rotation
        : 0,
  }
}

const platedHoleToObstacle = (platedHole: PcbPlatedHole): StitchingObstacle => {
  if (platedHole.shape === "circle") {
    return {
      kind: "circle",
      center: { x: platedHole.x, y: platedHole.y },
      radius: platedHole.outer_diameter / 2,
    }
  }
  if ("outer_width" in platedHole) {
    return {
      kind: "rect",
      center: { x: platedHole.x, y: platedHole.y },
      width: platedHole.outer_width,
      height: platedHole.outer_height,
      ccwRotation: platedHole.ccw_rotation,
    }
  }
  if (platedHole.shape === "hole_with_polygon_pad") {
    const rotationRadians = ((platedHole.ccw_rotation ?? 0) * Math.PI) / 180
    const cosine = Math.cos(rotationRadians)
    const sine = Math.sin(rotationRadians)
    return {
      kind: "polygon",
      points: platedHole.pad_outline.map((point) => ({
        x: platedHole.x + point.x * cosine - point.y * sine,
        y: platedHole.y + point.x * sine + point.y * cosine,
      })),
    }
  }
  return {
    kind: "rect",
    center: { x: platedHole.x, y: platedHole.y },
    width: platedHole.rect_pad_width,
    height: platedHole.rect_pad_height,
    ccwRotation:
      "rect_ccw_rotation" in platedHole
        ? (platedHole.rect_ccw_rotation ?? 0)
        : 0,
  }
}

const holeToObstacle = (hole: PcbHole): StitchingObstacle => {
  if ("hole_diameter" in hole) {
    if (hole.hole_shape === "circle") {
      return {
        kind: "circle",
        center: { x: hole.x, y: hole.y },
        radius: hole.hole_diameter / 2,
      }
    }
    return {
      kind: "rect",
      center: { x: hole.x, y: hole.y },
      width: hole.hole_diameter,
      height: hole.hole_diameter,
      ccwRotation: 0,
    }
  }
  return {
    kind: "rect",
    center: { x: hole.x, y: hole.y },
    width: hole.hole_width,
    height: hole.hole_height,
    ccwRotation: hole.hole_shape === "rotated_pill" ? hole.ccw_rotation : 0,
  }
}

const getDistanceToSegment = (point: Point, start: Point, end: Point) => {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const squaredLength = segmentX ** 2 + segmentY ** 2
  if (squaredLength === 0)
    return Math.hypot(point.x - start.x, point.y - start.y)
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
        squaredLength,
    ),
  )
  return Math.hypot(
    point.x - (start.x + projection * segmentX),
    point.y - (start.y + projection * segmentY),
  )
}

const isPointInPolygon = (point: Point, polygon: Point[]) => {
  let isInside = false
  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex++
  ) {
    const current = polygon[currentIndex]!
    const previous = polygon[previousIndex]!
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

const doesCircleIntersectObstacle = (
  center: Point,
  radius: number,
  obstacle: StitchingObstacle,
) => {
  if (obstacle.kind === "circle") {
    return (
      Math.hypot(center.x - obstacle.center.x, center.y - obstacle.center.y) <
      radius + obstacle.radius
    )
  }
  if (obstacle.kind === "polygon") {
    if (isPointInPolygon(center, obstacle.points)) return true
    return obstacle.points.some((point, pointIndex) =>
      Boolean(
        getDistanceToSegment(
          center,
          point,
          obstacle.points[(pointIndex + 1) % obstacle.points.length]!,
        ) < radius,
      ),
    )
  }

  const rotationRadians = (-obstacle.ccwRotation * Math.PI) / 180
  const deltaX = center.x - obstacle.center.x
  const deltaY = center.y - obstacle.center.y
  const localX =
    deltaX * Math.cos(rotationRadians) - deltaY * Math.sin(rotationRadians)
  const localY =
    deltaX * Math.sin(rotationRadians) + deltaY * Math.cos(rotationRadians)
  const outsideX = Math.max(Math.abs(localX) - obstacle.width / 2, 0)
  const outsideY = Math.max(Math.abs(localY) - obstacle.height / 2, 0)
  return Math.hypot(outsideX, outsideY) < radius
}

export const getStitchingObstacles = (
  circuitJson: AnyCircuitElement[],
  layers: readonly [LayerRef, LayerRef],
): StitchingObstacle[] =>
  circuitJson.flatMap((element) => {
    if (
      element.type === "pcb_component" &&
      layerMatches(element.layer, layers)
    ) {
      const obstacle = componentToObstacle(element)
      return obstacle ? [obstacle] : []
    }
    if (element.type === "pcb_smtpad" && layerMatches(element.layer, layers)) {
      return [smtPadToObstacle(element)]
    }
    if (
      element.type === "pcb_plated_hole" &&
      element.layers.some((layer) => layerMatches(layer, layers))
    ) {
      return [platedHoleToObstacle(element)]
    }
    if (element.type === "pcb_hole") return [holeToObstacle(element)]
    return []
  })

export const doesViaIntersectStitchingObstacle = ({
  center,
  radius,
  obstacles,
}: {
  center: Point
  radius: number
  obstacles: StitchingObstacle[]
}) =>
  obstacles.some((obstacle) =>
    doesCircleIntersectObstacle(center, radius, obstacle),
  )
