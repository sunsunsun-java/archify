# Content-adaptive canvas

Architecture, Dataflow, Sequence and Lifecycle schema-v1 accept
`meta.canvas_fit: "content"`. Workflow keeps its own existing layout contract.
For a new diagram without a user-specified size, set this field and omit
`meta.viewBox`. Existing documents do not implicitly opt in.

Content mode measures finite SVG paint in world coordinates, retains origin
`[0,0]`, and chooses a finite canonical frame. An explicit viewBox remains
authoritative, including a smaller-than-default frame that satisfies actual
paint containment and the renderer's existing semantic content-area rules.
The implicit defaults remain lower bounds, not fixed output sizes.

Positions, dimensions, route controls and semantic collections are unchanged.
Sequence spread alone recalculates derived horizontal geometry from final width;
its participant order and all authored times are unchanged. Row, stage and
column limits are not expanded. Canvas-relative backgrounds and lifelines are
measured only after deciding content and legend space, preventing self-growth.
The shared Viewer and full-canonical export contract remain unchanged.

Runnable examples: [Architecture](../examples/content-services.architecture.json),
[Dataflow](../examples/content-pipelines.dataflow.json),
[Sequence](../examples/content-release.sequence.json), and
[Lifecycle](../examples/content-recovery.lifecycle.json).
The renderer emits the existing `data-reader-fit="intrinsic-height"` hint so
the reader can budget height without moving canonical geometry. Its large-world
threshold remains 6 CSS px; intrinsic readers include the narrow shell's wrapped
header in the prospective safe-height measurement. Their message labels also
participate in the shared reading budget. Initial camera entry waits for the
navigation dock and reader height to settle before choosing a readable target.

## Paint and diagnostics

The renderer owns topology, text placement and routing; the internal shared
module unions finite paint rectangles and checks containment. Rounded paths
remain inside the control-point hull. Stroke joins conservatively use the SVG
default miter-limit envelope; markers use the rendered triangle, orientation
and stroke-width units. Text metrics are conservative estimates, supplemented
by independent font-settled browser checks. Paint containment permits 1e-7 SVG
units of numerical round-off, not a visible clipping allowance.

`validate --layout-json` does not publish HTML. It returns final geometry and,
in content mode, `canvas.mode`, `source`, `canonicalFrame`, `paintBounds` and
deterministic edge contributors. Sequence spread also reports `iterations`
(at most 32). Ordinary input/schema/layout failures retain classified,
non-zero machine-readable results. Existing receipt fields retain their meaning.

| Code | Meaning and evidence |
| --- | --- |
| `canvas/capacity` | Paint exceeds a fixed right/bottom boundary. Evidence includes actualViewBox, paintBounds, overflow and contributing input paths. |
| `canvas/origin-conflict` | Paint enters negative x/y. Increasing right/bottom capacity cannot repair it; no size fix is advertised. |
| `canvas/non-finite-bounds` | Arithmetic yields non-finite or invalid paint; subject identifies its input owner. |
| `canvas/non-convergent` | A coupled layout fails its bounded solve; evidence reports iterations and last frame. |

`requiredViewBox` in a failed diagnostic is a verified sufficient candidate,
not a claim of global minimum size. A candidate enters `supportedFixes` only
after a bounded, full renderer-layout verification with unchanged semantic
input. Other unresolved layout errors prevent a guaranteed size suggestion.
Default auto legends cannot silently disappear in content mode. Existing legend
diagnostic codes remain applicable when an explicit frame cannot house them.

See [authoring rules](authoring-contract.md) for constraints a larger canvas
does not repair and [delivery](delivery-contract.md) for browser/export evidence.
