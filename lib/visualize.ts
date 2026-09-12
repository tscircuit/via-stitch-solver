import type { AnyCircuitElement, Point } from "circuit-json"
import type { GraphicsObject } from "graphics-debug"
import { getStitchingObstacles } from "./geometry/circuit-element-obstacles"
import type { ViaStitchPcbVia } from "./types"

export interface CandidateDecision {
  center: Point
  radius: number
  reason:
    | "Candidate accepted"
    | "Too close to another via"
    | "Obstacle clearance"
    | "Outside shared copper"
}

interface ViaStitchVisualization {
  title: string
  candidates?: ViaStitchPcbVia[]
  accepted?: ViaStitchPcbVia[]
  rejected?: ViaStitchPcbVia[]
  currentCandidate?: CandidateDecision
}

const graphicsLayer = (layers: string[]) =>
  `z${[...new Set(layers.map((layer) => (layer === "top" ? "0" : layer === "bottom" ? "1" : layer)))].join(",")}`

/** Board-world points in mm: +X right, +Y up, viewed from above the PCB. */
export const visualizeViaStitching = (
  circuitJson: AnyCircuitElement[],
  state: ViaStitchVisualization,
): GraphicsObject => {
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    title: state.title,
    lines: [],
    rects: [],
    circles: [],
    points: [],
  }
  const outline = (
    points: Point[],
    color: string,
    label: string,
    layer?: string,
  ) => {
    if (!points.length) return
    graphics.lines!.push({
      points: [...points, points[0]!],
      strokeColor: color,
      strokeWidth: 0.05,
      label,
      layer,
    })
  }
  for (const element of circuitJson) {
    const layer =
      "layers" in element && Array.isArray(element.layers)
        ? graphicsLayer(element.layers)
        : "layer" in element && typeof element.layer === "string"
          ? graphicsLayer([element.layer])
          : undefined
    if (element.type === "pcb_board") {
      const { center, width, height } = element
      if (!element.outline && (width === undefined || height === undefined))
        continue
      outline(
        element.outline ?? [
          { x: center.x - (width ?? 0) / 2, y: center.y - (height ?? 0) / 2 },
          { x: center.x + (width ?? 0) / 2, y: center.y - (height ?? 0) / 2 },
          { x: center.x + (width ?? 0) / 2, y: center.y + (height ?? 0) / 2 },
          { x: center.x - (width ?? 0) / 2, y: center.y + (height ?? 0) / 2 },
        ],
        "#64748b",
        "Board outline",
      )
    } else if (element.type === "pcb_copper_pour" && element.shape === "brep") {
      // Draw every ring without filling across voids or overlapping net pours.
      const color = element.layer === "top" ? "#e87979" : "#7b9bea"
      for (const ring of [
        element.brep_shape.outer_ring,
        ...element.brep_shape.inner_rings,
      ]) {
        outline(
          ring.vertices,
          color,
          `${element.source_net_id} ${element.layer} copper boundary`,
          layer,
        )
      }
    } else if (element.type === "pcb_trace") {
      for (let i = 1; i < element.route.length; i++) {
        const start = element.route[i - 1]!
        const end = element.route[i]!
        if (
          start.route_type !== "wire" ||
          end.route_type !== "wire" ||
          start.layer !== end.layer
        )
          continue
        graphics.lines!.push({
          points: [start, end],
          strokeWidth: start.width,
          strokeColor: start.layer === "top" ? "#d36a6a" : "#5c82cc",
          label: element.pcb_trace_id,
          layer: graphicsLayer([start.layer]),
        })
      }
    } else if (element.type === "pcb_via") {
      graphics.circles!.push({
        center: element,
        radius: element.outer_diameter / 2,
        stroke: "#475569",
        fill: "#cbd5e1",
        label: `Existing ${element.pcb_via_id}`,
        layer,
      })
    } else if (element.type === "pcb_keepout") {
      const label = `Keepout: ${element.pcb_keepout_id}`
      if (element.shape === "rect") {
        graphics.rects!.push({
          center: element.center,
          width: element.width,
          height: element.height,
          fill: "rgba(168, 85, 247, 0.12)",
          stroke: "#a855f7",
          label,
          layer,
        })
      } else if (element.shape === "circle") {
        graphics.circles!.push({
          center: element.center,
          radius: element.radius,
          fill: "rgba(168, 85, 247, 0.12)",
          stroke: "#a855f7",
          label,
          layer,
        })
      }
    } else {
      for (const obstacle of getStitchingObstacles(
        [element],
        ["top", "bottom"],
      )) {
        const style = {
          fill: "rgba(100, 116, 139, 0.18)",
          stroke: "#94a3b8",
          layer,
          label: element.type,
        }
        if (obstacle.kind === "circle") {
          graphics.circles!.push({
            center: obstacle.center,
            radius: obstacle.radius,
            ...style,
          })
        } else if (obstacle.kind === "rect") {
          graphics.rects!.push({
            center: obstacle.center,
            width: obstacle.width,
            height: obstacle.height,
            ccwRotationDegrees: obstacle.ccwRotation,
            ...style,
          })
        } else {
          outline(obstacle.points, "#94a3b8", element.type, layer)
        }
      }
    }
  }
  for (const [vias, color, label] of [
    [state.candidates ?? [], "#d97706", "Candidate"],
    [state.accepted ?? [], "#16a34a", "DRC retained"],
    [state.rejected ?? [], "#dc2626", "DRC rejected"],
  ] as const) {
    for (const via of vias) {
      const layer = graphicsLayer(via.layers)
      graphics.circles!.push({
        center: via,
        radius: via.outer_diameter / 2,
        fill: "transparent",
        stroke: color,
        layer,
        label: `${label}: ${via.pcb_via_id}`,
      })
      if (label === "DRC rejected") {
        const r = via.outer_diameter
        for (const sign of [-1, 1]) {
          graphics.lines!.push({
            points: [
              { x: via.x - r, y: via.y - r * sign },
              { x: via.x + r, y: via.y + r * sign },
            ],
            strokeColor: color,
            strokeWidth: 0.08,
            layer,
            label: `${label}: ${via.pcb_via_id}`,
          })
        }
      }
    }
  }
  if (state.currentCandidate) {
    const { center, radius, reason } = state.currentCandidate
    graphics.circles!.push({
      center,
      radius,
      stroke: "#0891b2",
      fill: "transparent",
      label: `Current grid point: ${reason}`,
    })
  }
  return graphics
}
