import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import KindFields from "./KindFields.svelte";

const props = (over: Record<string, unknown> = {}) => ({ kind: null, report: {}, idPrefix: "t", ...over });

describe("KindFields", () => {
  test("four kind chips, none picked by default", () => {
    const { body } = render(KindFields, { props: props() });
    for (const label of ["Bug", "Wrong behaviour", "Idea", "Question"]) expect(body).toContain(`>${label}</button>`);
    expect(body).toContain('role="radiogroup" aria-label="What is it?"');
    expect(body).not.toContain('aria-checked="true"');
    expect(body).not.toContain("What did you expect to happen?");
  });

  test("Bug and Wrong behaviour ask expected, actual and how often", () => {
    for (const kind of ["bug", "behaviour"]) {
      const { body } = render(KindFields, { props: props({ kind, report: { expected: "Saved", repeat: "always" } }) });
      expect(body).toContain('for="t-expected"');
      expect(body).toContain("What happened instead?");
      expect(body).toContain("How often?");
      expect(body).toMatch(/aria-checked="true"[^>]*>\s*Every time/);
    }
  });

  test("Idea and Question don't", () => {
    for (const kind of ["idea", "question"]) {
      const { body } = render(KindFields, { props: props({ kind }) });
      expect(body).not.toContain("What did you expect to happen?");
      expect(body).toMatch(/aria-checked="true"[^>]*>\s*(Idea|Question)/);
    }
  });

  test("the thin-ticket nudge offers Send anyway", () => {
    const { body } = render(KindFields, { props: props({ kind: "bug", nudge: true }) });
    expect(body).toContain('class="nudge');
    expect(body).toContain("Send anyway");
    expect(render(KindFields, { props: props({ kind: "bug" }) }).body).not.toContain("Send anyway");
  });
});
