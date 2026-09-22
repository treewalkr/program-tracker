**Assessment B evidence — apps/web/src**

**STEP 1 — CLI detector**
- Command: `/Users/ralim1/.pi/agent/skills/impeccable/scripts/impeccable detect --json apps/web/src`
- Exit code: **0 (clean)**
- Full JSON output: `[]` — zero findings, no rule names, no file locations, counts all 0.

**STEP 2 — Browser evidence** (vite preview :4175, headless Chromium, axe-core 4.10.2 from CDN)

All 4 routes loaded successfully; mutation preflight (set `document.title='probe-XYZ'` + append empty `<script>`, then read back) succeeded on every route; axe script injected and ran on every route.

| Route | Mutation OK | Axe violations | Console errors |
|---|---|---|---|
| `/` | Yes (`probe-sbje0i`) | `color-contrast` serious ×12 (ex: `.side-foot > p:nth-child(2)`); `empty-table-header` minor ×1 (ex: `th:nth-child(5)`) | 0 |
| `/clients` | Yes (`probe-byalfq`) | `color-contrast` serious ×10 (ex: `.side-foot > p:nth-child(2)`) | 0 |
| `/clients/cl-maya` | Yes (`probe-o98e0x`) | `color-contrast` serious ×53 (ex: `.side-foot > p:nth-child(2)`) | 0 |
| `/clients/cl-maya/generate` | Yes (`probe-bve668`) | `color-contrast` serious ×6 (ex: `.side-foot > .subtle`) | 0 |

Cleanup: `pkill -f 'vite preview'` executed. No steps skipped or failed. Progress written to `.pi-subagents/artifacts/progress/66587766/progress.md`.