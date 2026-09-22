---
target_identity: "file:/Users/ralim1/Documents/personal/projects/program-tracker/apps-web-src-routes"
timestamp: 2026-09-22T16-49-22Z
slug: apps-web-src-routes
---
Assessment A (reviewer, design-director): heuristics 27/40.
P1: reject flow dead-end (no state change, approve-after-reject); click-only table rows (no keyboard/a11y); unconfirmed destructive deletes (template x, /templates Delete).
P2: program detail = control wall (229 focusable, archived editable); <=860px nav collapse broken (bare text nodes), log page 390px overflow.
Minor: literal "Client / Program" crumb, lowercase diff names, 0kg e1RM for bodyweight, hardcoded week-13 sub, savedCount reset, --faint ~3:1 contrast, dead Rpe.svelte, providers panel on dashboard, US date format, no archive path, overview error swallow.

Assessment B (delegate, detector+axe): detector CLI exit 0 (clean). Axe color-contrast serious: / x12, /clients x10, /clients/cl-maya x53, generate x6 (.side-foot .subtle, --faint). empty-table-header minor x1 (dashboard th 5). 0 console errors all routes.

Synthesis: contrast token corroborated by both. Priority: P1 trio + --faint/--subtle contrast before demo; P2 program read-view + responsive for post-demo.
