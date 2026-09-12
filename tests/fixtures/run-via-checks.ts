import {
  checkDifferentNetViaSpacing,
  checkEachPcbTraceNonOverlapping,
  checkSameNetViaSpacing,
  checkViaPadClearance,
  checkViaTraceClearance,
} from "@tscircuit/checks"
import type { AnyCircuitElement } from "circuit-json"

export const runViaClearanceChecks = (circuitJson: AnyCircuitElement[]) => [
  ...checkEachPcbTraceNonOverlapping(structuredClone(circuitJson)),
  ...checkViaPadClearance(circuitJson),
  ...checkViaTraceClearance(circuitJson),
  ...checkSameNetViaSpacing(circuitJson),
  ...checkDifferentNetViaSpacing(circuitJson),
]
