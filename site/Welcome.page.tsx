import type React from "react"

const usage = `const solver = new ViaStitchSolver({
  circuitJson,
  options: { viaPitch: 2, pourEdgeClearance: 0.2 },
})

solver.solve()
const { pcbVias } = solver.getOutput()`

export default function WelcomePage() {
  return (
    <main style={styles.main}>
      <p style={styles.eyebrow}>tscircuit geometry</p>
      <h1 style={styles.title}>@tscircuit/via-stitch-solver</h1>
      <p style={styles.lede}>
        Place a clearance-aware via grid wherever existing same-net copper pours
        overlap on two PCB layers.
      </p>
      <h2>Install</h2>
      <pre style={styles.pre}>
        <code>bun add @tscircuit/via-stitch-solver</code>
      </pre>
      <h2>Use with Circuit JSON</h2>
      <pre style={styles.pre}>
        <code>{usage}</code>
      </pre>
      <a href="https://github.com/tscircuit/via-stitch-solver">GitHub</a>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    width: "min(920px, calc(100% - 32px))",
    margin: "0 auto",
    padding: "48px 0 64px",
    color: "#17202a",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    lineHeight: 1.55,
  },
  eyebrow: {
    color: "#0b766e",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  title: {
    fontSize: "clamp(2rem, 7vw, 4rem)",
    lineHeight: 1,
  },
  lede: {
    maxWidth: 760,
    color: "#5f6f7a",
    fontSize: "1.12rem",
  },
  pre: {
    overflowX: "auto",
    padding: 16,
    border: "1px solid #d7dee4",
    borderRadius: 8,
    background: "#f7f9fb",
  },
}
