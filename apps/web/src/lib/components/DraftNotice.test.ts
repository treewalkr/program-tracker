import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import DraftNotice from "./DraftNotice.svelte";
import type { DraftNotice as Notice } from "$lib/generationWatch.svelte";

const n = (id: string, over: Partial<Notice> = {}): Notice => ({
  id,
  tone: "ready",
  clientId: "c1",
  clientName: "Ada",
  title: `Ada’s draft ${id} is ready`,
  reason: null,
  href: `/clients/c1/generate`,
  ...over,
});
const noop = () => {};

describe("DraftNotice", () => {
  test("ready notice: title, Review link, dismiss", () => {
    const { body } = render(DraftNotice, { props: { notices: [n("a")], onopen: noop, ondismiss: noop } });
    expect(body).toContain("Ada’s draft a is ready");
    expect(body).toContain('href="/clients/c1/generate"');
    expect(body).toContain(">Review<");
    expect(body).toContain('aria-label="Dismiss: Ada’s draft a is ready"');
    expect(body).toContain('aria-live="polite"');
  });

  test("failed notice: reason and Open", () => {
    const { body } = render(DraftNotice, {
      props: { notices: [n("a", { tone: "failed", title: "Ada’s draft failed", reason: "Provider timed out" })], onopen: noop, ondismiss: noop },
    });
    expect(body).toContain("Provider timed out");
    expect(body).toContain(">Open<");
    expect(body).toContain("lamp red");
  });

  test("more than three fold into +N more", () => {
    const notices = ["a", "b", "c", "d", "e"].map((id) => n(id));
    const { body } = render(DraftNotice, { props: { notices, onopen: noop, ondismiss: noop, ondismissall: noop } });
    expect(body).toContain("draft c is ready");
    expect(body).not.toContain("draft d is ready");
    expect(body).toContain("+2 more");
    expect(body).toContain("Dismiss all");
  });
});
