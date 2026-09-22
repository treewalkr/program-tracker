# Task for delegate

ROLE: Assessment B of an impeccable critique run — mechanical detector + browser evidence. NO design opinions.

TARGET: apps/web/src (SvelteKit app).

STEP 1 — CLI detector (required):
/Users/ralim1/.pi/agent/skills/impeccable/scripts/impeccable detect --json apps/web/src
Record full JSON findings, exit code, rule names, file locations, counts. Exit 0=clean, 2=findings.

STEP 2 — browser evidence: start preview: `cd /Users/ralim1/Documents/personal/projects/program-tracker/apps/web && (bun run preview --port 4175 >/tmp/crit-b-preview.log 2>&1 &)` wait 3s. Then headless Playwright python: fresh page per route, visit 4 representative routes (/, /clients, /clients/cl-maya, /clients/cl-maya/generate). For each: mutation preflight `document.title='probe-XYZ'` via evaluate + append empty <script> tag, read back. Then load axe-core from CDN (https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js) and run `axe.run()` collecting violations summary (impact, id, count, one selector example) per page. Also count console errors. At END `pkill -f 'vite preview'`.

RETURN (plain text):
- detector: exit code, finding counts by rule, top findings with file:line (verbatim rule names)
- browser: per-page title-mutation OK?, axe violations (impact/id/count + one example selector), console error count
- skipped/failed steps with concrete reasons
No interpretation, just evidence.

---
Update progress at: /Users/ralim1/Documents/personal/projects/program-tracker/.pi-subagents/artifacts/progress/66587766/progress.md

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return a concise result and residual risks when applicable

Required evidence: manual-notes, residual-risks

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