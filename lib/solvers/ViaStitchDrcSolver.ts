import { BaseSolver } from "@tscircuit/solver-utils"
import type { AnyCircuitElement } from "circuit-json"
import type { ViaStitchPcbVia } from "../types"
import { visualizeViaStitching } from "../visualize"
import { removeViasWithDrcErrors } from "./remove-vias-with-drc-errors"

interface ViaStitchDrcInput {
  circuitJson: AnyCircuitElement[]
  candidates: ViaStitchPcbVia[]
}

export class ViaStitchDrcSolver extends BaseSolver {
  private pcbVias: ViaStitchPcbVia[] = []
  private rejectedVias: ViaStitchPcbVia[] = []

  constructor(private readonly input: ViaStitchDrcInput) {
    super()
  }

  override _step() {
    this.pcbVias = removeViasWithDrcErrors(
      this.input.circuitJson,
      this.input.candidates,
    )
    const acceptedIds = new Set(this.pcbVias.map((via) => via.pcb_via_id))
    this.rejectedVias = this.input.candidates.filter(
      (via) => !acceptedIds.has(via.pcb_via_id),
    )
    this.stats = {
      candidates: this.input.candidates.length,
      retained: this.pcbVias.length,
      rejected: this.rejectedVias.length,
    }
    this.solved = true
    this.progress = 1
  }

  override getConstructorParams(): [ViaStitchDrcInput] {
    return [this.input]
  }

  override visualize() {
    return visualizeViaStitching(this.input.circuitJson, {
      title: this.solved ? "DRC complete" : "DRC: validate candidates",
      candidates: this.solved ? [] : this.input.candidates,
      accepted: this.pcbVias,
      rejected: this.rejectedVias,
    })
  }

  override getOutput() {
    return this.pcbVias
  }
}
