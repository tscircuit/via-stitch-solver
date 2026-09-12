import {
  checkDifferentNetViaSpacing,
  checkEachPcbTraceNonOverlapping,
  checkPcbCopperOverKeepout,
  checkSameNetViaSpacing,
  checkViaPadClearance,
  checkViaTraceClearance,
  checkViasOffBoard,
} from "@tscircuit/checks"
import type { AnyCircuitElement, PcbVia } from "circuit-json"
import type { ViaStitchPcbVia } from "../types"

/** Validate generated stitching vias without modifying existing routed copper. */
export const removeViasWithDrcErrors = (
  circuitJson: AnyCircuitElement[],
  candidateVias: ViaStitchPcbVia[],
): ViaStitchPcbVia[] => {
  if (candidateVias.length === 0) return []

  // The overlap check annotates trace endpoints in place. Validate a copy so
  // callers retain ownership of their original routing and connectivity.
  const stitchedCircuitJson = structuredClone([
    ...circuitJson,
    ...candidateVias,
  ])
  const rejectedViaIds = new Set<PcbVia["pcb_via_id"]>()
  // checks classifies actual trace/via contact as a generic overlap, not a
  // via-trace clearance error. That record has no structured obstacle ID;
  // recover it from checks' overlap_<pcb_trace_id>_<obstacle_id> identifier.
  for (const error of checkEachPcbTraceNonOverlapping(stitchedCircuitJson)) {
    const prefix = `overlap_${error.pcb_trace_id}_`
    if (error.pcb_trace_error_id.startsWith(prefix)) {
      rejectedViaIds.add(error.pcb_trace_error_id.slice(prefix.length))
    }
  }
  for (const error of checkViaPadClearance(stitchedCircuitJson)) {
    for (const padId of error.pcb_pad_ids) rejectedViaIds.add(padId)
  }
  for (const error of checkViaTraceClearance(stitchedCircuitJson)) {
    rejectedViaIds.add(error.pcb_via_id)
  }
  for (const error of [
    ...checkSameNetViaSpacing(stitchedCircuitJson),
    ...checkDifferentNetViaSpacing(stitchedCircuitJson),
  ]) {
    for (const viaId of error.pcb_via_ids) rejectedViaIds.add(viaId)
  }

  // Placement errors do not expose a structured via ID. Check each candidate
  // against the board and keepouts alone so existing placement errors cannot
  // reject an unrelated stitching via, and no error-message parsing is needed.
  const boardAndKeepouts = circuitJson.filter(
    (element) => element.type === "pcb_board" || element.type === "pcb_keepout",
  )
  return candidateVias.filter((via) => {
    if (rejectedViaIds.has(via.pcb_via_id)) return false
    const viaPlacement = [...boardAndKeepouts, via]
    return (
      checkViasOffBoard(viaPlacement).length === 0 &&
      checkPcbCopperOverKeepout(viaPlacement).length === 0
    )
  })
}
