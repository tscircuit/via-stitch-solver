import {
  BasePipelineSolver,
  type BaseSolver,
  type PipelineStep,
  definePipelineStep,
} from "@tscircuit/solver-utils"
import type { ViaStitchSolverInput, ViaStitchSolverOutput } from "../types"
import { visualizeViaStitching } from "../visualize"
import {
  resolveOptions,
  ViaStitchCandidateSolver,
} from "./ViaStitchCandidateSolver"
import { ViaStitchDrcSolver } from "./ViaStitchDrcSolver"

export class ViaStitchSolver extends BasePipelineSolver<ViaStitchSolverInput> {
  candidate_generation?: ViaStitchCandidateSolver
  drc?: ViaStitchDrcSolver

  pipelineDef: PipelineStep<BaseSolver>[] = [
    definePipelineStep(
      "candidate_generation",
      ViaStitchCandidateSolver,
      (solver: ViaStitchSolver) => [solver.inputProblem],
    ),
    definePipelineStep("drc", ViaStitchDrcSolver, (solver: ViaStitchSolver) => [
      {
        circuitJson: solver.inputProblem.circuitJson,
        candidates: solver.candidate_generation!.getOutput().pcbVias,
      },
    ]),
  ]

  constructor(input: ViaStitchSolverInput) {
    super(input)
    // Preserve synchronous option validation at the public constructor boundary.
    resolveOptions(input.options)
  }

  get phase(): "stitching" | "drc" | "complete" {
    return this.solved
      ? "complete"
      : this.currentPipelineStageIndex === 0
        ? "stitching"
        : "drc"
  }

  override getConstructorParams(): [ViaStitchSolverInput] {
    return [this.inputProblem]
  }

  override visualize() {
    // Keep the currently inspected stage visible at stage boundaries too.
    // BasePipelineSolver's combined view duplicates the board across stages.
    return (
      (this.drc ?? this.candidate_generation)?.visualize() ??
      visualizeViaStitching(this.inputProblem.circuitJson, {
        title: "Input copper pours",
      })
    )
  }

  override getOutput(): ViaStitchSolverOutput {
    return {
      processedCopperPourPairCount:
        this.candidate_generation?.getOutput().processedCopperPourPairCount ??
        0,
      pcbVias: this.solved ? this.drc!.getOutput() : [],
    }
  }
}
