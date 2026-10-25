# Four-layer stitching reproduction

A generated 10 mm board has GND pours on inner1 and bottom, a foreign top
power pour, and a foreign inner2 signal. Default stitching returns no vias
because it only considers top/bottom pours. With top/bottom GND instead, the
same implementation emits two-layer records and ignores the inner copper.

The new regression intentionally fails on the reproduction branch. It requires
nonzero full-stack 0.30/0.50 mm vias, clearance from the signal and power copper,
and unchanged input. Images below show the original input; zero stitching is
the defect, not an accepted fabrication result.

![Inner ground plane before](before-inner1.png)
![Inner signal before](before-inner2.png)

Run `bun scripts/measure-four-layer-stitching.ts <checkout> <report.json>` for
paired measurements on the same generated inner-plane, outer-plane and
unchanged two-layer control cases. The report records span/contact failures,
input immutability, output hashes and ten measured timings after two warmups.
Benchmark results will be posted on each PR before merge; no board speedup is
inferred from these small cases.
