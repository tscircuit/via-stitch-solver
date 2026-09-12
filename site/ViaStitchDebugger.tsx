import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { useState } from "react"
import { ViaStitchSolver } from "../lib"
import type { ViaStitchSolverInput } from "../lib"

export function ViaStitchDebugger({
  title,
  description,
  createInput,
}: {
  title: string
  description: string
  createInput: () => ViaStitchSolverInput
}) {
  const [resetCount, setResetCount] = useState(0)
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "#17202a",
        padding: 20,
      }}
    >
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>{title}</h1>
      <p style={{ maxWidth: 1000 }}>{description}</p>
      <p style={{ fontSize: 14 }}>
        Once candidate generation starts, Step checks one grid point. Use Next
        Stage to advance phases. Enable object interaction for hover labels; use
        the layer controls to isolate top (z0) or bottom (z1).
      </p>
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <span style={{ color: "#0891b2" }}>◯ Current point</span>
        <span style={{ color: "#b45309" }}>◯ Candidate</span>
        <span style={{ color: "#15803d" }}>◯ DRC retained</span>
        <span style={{ color: "#dc2626" }}>× DRC rejected</span>
        <span>Red / blue outlines: top / bottom copper boundaries</span>
        <button
          type="button"
          onClick={() => setResetCount((count) => count + 1)}
          style={{ padding: "6px 12px", cursor: "pointer" }}
        >
          Reset example
        </button>
      </div>
      <GenericSolverDebugger
        key={resetCount}
        animationSpeed={50}
        createSolver={() => new ViaStitchSolver(createInput())}
      />
    </main>
  )
}
