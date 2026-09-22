# Task for reviewer

[Read from: /Users/ralim1/.pi/agent/skills/impeccable/reference/critique.md]

ROLE: Design-director UX/UI review (Assessment A of an impeccable critique run). You are reviewing a MOCKED trainer web app (SvelteKit 5, SPA, chalk-and-iron design system: warm paper background, ink typography, chalk accents). Product: program tracker for a solo personal trainer — clients, periodized programs, session logging, AI-drafted next blocks. Mode: OPERATE (task completion, scanability, consistency outrank expression).

TARGET: apps/web/src — routes: / (dashboard), /clients, /clients/[id], /clients/[id]/generate, /clients/[id]/log, /clients/[id]/programs/new, /programs/[id], /templates, /exercises; components in src/lib/components; shared CSS in src/app.css. Read app.css + layout + ALL route pages fully. ALSO inspect the live app: run `cd /Users/ralim1/Documents/personal/projects/program-tracker/apps/web && (bun run preview --port 4174 >/tmp/crit-a-preview.log 2>&1 &)` then wait 3s, then write+run a headless Playwright python script (chromium, viewport 1440x900) that visits EVERY route (navigate each, wait networkidle+600ms, dump page.inner_text('body') — first 3000 chars each — and count focusable elements, check headings). At the END `pkill -f 'vite preview'`. Sample data: client ids cl-maya, cl-jonas. Program pages: find program links from /clients/cl-maya body text.

DO NOT run any design detector script. Design judgment only.

EVALUATE:
1. Design specificity: could an unrelated SaaS use this UI unchanged, or is it grounded in strength-coaching (chalk/iron identity, kg/RPE/e1RM vocabulary, coach-tone copy)?
2. Holistic: hierarchy, IA (nav structure), emotional fit, discoverability, composition, typography, color use, states (loading/empty/error), copy, edge cases.
3. Cognitive load: any screen with >4 simultaneous decision points? Form lengths? Modal vs inline choices?
4. Emotional journey: peak-end on the generate→approve flow, reassurance at destructive actions (reject draft, delete), logging flow friction.
5. Nielsen 10 heuristics scored 0-4 each (mark n/a where allowed for an operate-mode tool): visibility of system status, match with real world, user control & freedom, consistency, error prevention, recognition over recall, flexibility, aesthetic/minimalist, error recovery, help.

RETURN (plain text, compact):
- design-specificity verdict (1 para)
- heuristic table: name: score/4 + one-line justification
- cognitive load findings (bullet list, each with file/route)
- emotional journey findings
- 2-3 strengths
- 3-5 PRIORITY issues (each: what, why it hurts, which file/route, concrete fix suggestion)
- minor observations (bullets)
- 2-3 provocative questions for the trainer-user
Be specific: cite routes/files, quote copy where relevant. No praise-padding.

---
Update progress at: /Users/ralim1/Documents/personal/projects/program-tracker/.pi-subagents/artifacts/progress/f80281f2/progress.md

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```