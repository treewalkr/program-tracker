import { describe, expect, test } from "bun:test";
import type { GenerationDto, PendingGenerationDto } from "./api/types";
import { createGenerationWatch, noticeTitle, onDraftPage, shortReason, type DraftNotice } from "./generationWatch.svelte";

const gen = (over: Partial<GenerationDto> = {}): GenerationDto => ({
  id: "g1",
  clientId: "c1",
  basedOnProgramId: null,
  kind: "block",
  targetWeek: null,
  providerId: "mock",
  model: "m",
  status: "validated",
  draft: null,
  error: null,
  parentGenerationId: null,
  revisionMessage: null,
  instructions: null,
  rejectReason: null,
  approvedProgramId: null,
  exampleProgramIds: [],
  createdAt: new Date().toISOString(),
  ...over,
});

const pendingRow = (over: Partial<PendingGenerationDto> = {}): PendingGenerationDto => ({
  id: "g1",
  clientId: "c1",
  clientName: "Ada Lovelace",
  kind: "block",
  targetWeek: null,
  createdAt: new Date().toISOString(),
  ...over,
});

/** A watcher on a fake clock: timers run only when `tick()` is called. */
function harness(opts: { pending?: PendingGenerationDto[]; rows?: Record<string, GenerationDto>; path?: string; hidden?: boolean } = {}) {
  const env = {
    pending: opts.pending ?? [],
    rows: opts.rows ?? {},
    gens: [] as GenerationDto[],
    path: opts.path ?? "/clients",
    hidden: opts.hidden ?? false,
    pendingCalls: 0,
    timers: [] as { fn: () => void; ms: number }[],
    notified: [] as DraftNotice[],
  };
  const watch = createGenerationWatch({
    api: {
      pendingGenerations: async () => {
        env.pendingCalls++;
        return env.pending;
      },
      generation: async (id) => {
        const row = env.rows[id];
        if (!row) throw Object.assign(new Error("generation not found"), { status: 404 });
        return row;
      },
      generations: async () => env.gens,
    },
    path: () => env.path,
    hidden: () => env.hidden,
    notify: (n) => env.notified.push(n),
    setTimer: (fn, ms) => {
      const t = { fn, ms };
      env.timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      env.timers = env.timers.filter((x) => x !== t);
    },
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Fire the pending timer and let its poll finish. */
  const tick = async () => {
    const t = env.timers.shift();
    t?.fn();
    for (let i = 0; i < 5; i++) await flush();
    return t;
  };
  return { env, watch, tick, flush };
}

describe("noticeTitle", () => {
  test("block, week, fill and revision drafts", () => {
    expect(noticeTitle(gen(), "Ada Lovelace", "ready")).toBe("Ada’s draft is ready");
    expect(noticeTitle(gen({ kind: "week", targetWeek: 3 }), "Ada", "ready")).toBe("Ada’s week 3 is ready");
    expect(noticeTitle(gen({ kind: "fill" }), "Ada", "ready")).toBe("Ada’s filled weeks are ready");
    expect(noticeTitle(gen({ parentGenerationId: "p" }), "Ada", "ready")).toBe("Ada’s new version is ready");
    expect(noticeTitle(gen(), "James", "failed")).toBe("James’ draft failed");
  });

  test("shortReason keeps the first line, capped", () => {
    expect(shortReason("\nProvider timed out\nstack…")).toBe("Provider timed out");
    expect(shortReason(null)).toBeNull();
    expect(shortReason("x".repeat(200))!.length).toBe(118);
  });

  test("onDraftPage matches the client's generate and chat pages only", () => {
    expect(onDraftPage("/clients/c1/generate", "c1")).toBe(true);
    expect(onDraftPage("/clients/c1/chat", "c1")).toBe(true);
    expect(onDraftPage("/clients/c1", "c1")).toBe(false);
    expect(onDraftPage("/clients/c2/generate", "c1")).toBe(false);
  });
});

describe("createGenerationWatch", () => {
  test("nothing pending at start: one request, then no polling", async () => {
    const { env, watch } = harness();
    await watch.start();
    expect(env.pendingCalls).toBe(1);
    expect(env.timers).toHaveLength(0);
  });

  test("pending → validated: a ready notice, polling stops", async () => {
    const { env, watch, tick } = harness({ pending: [pendingRow()] });
    await watch.start();
    expect(watch.watched).toEqual(["g1"]);
    expect(env.timers[0].ms).toBe(5_000);

    env.pending = [];
    env.rows.g1 = gen({ status: "validated" });
    await tick();
    expect(watch.notices).toHaveLength(1);
    expect(watch.notices[0]).toMatchObject({ id: "g1", tone: "ready", title: "Ada’s draft is ready", href: "/clients/c1/generate" });
    expect(env.timers).toHaveLength(0);
    expect(env.notified).toHaveLength(0);
  });

  test("pending → failed: a failed notice with the reason", async () => {
    const { env, watch, tick } = harness({ pending: [pendingRow({ kind: "week", targetWeek: 3 })] });
    await watch.start();
    env.pending = [];
    env.rows.g1 = gen({ status: "failed_provider", kind: "week", targetWeek: 3, error: "Provider timed out" });
    await tick();
    expect(watch.notices[0]).toMatchObject({ tone: "failed", title: "Ada’s week 3 failed", reason: "Provider timed out" });
  });

  test("pending → cancelled or gone: no notice", async () => {
    const { env, watch, tick } = harness({ pending: [pendingRow(), pendingRow({ id: "g2" })] });
    await watch.start();
    env.pending = [];
    env.rows.g1 = gen({ status: "cancelled" });
    await tick();
    expect(watch.notices).toHaveLength(0);
    expect(watch.watched).toEqual([]);
    expect(env.timers).toHaveLength(0);
  });

  test("suppressed on that client's generate page; still notifies a hidden tab", async () => {
    const { env, watch, tick } = harness({ pending: [pendingRow()], path: "/clients/c1/generate" });
    await watch.start();
    env.pending = [];
    env.hidden = true;
    env.rows.g1 = gen();
    await tick();
    expect(watch.notices).toHaveLength(0);
    expect(env.notified.map((n) => n.id)).toEqual(["g1"]);
  });

  test("hidden tab polls every 30 s", async () => {
    const { env, watch } = harness({ pending: [pendingRow()], hidden: true });
    await watch.start();
    expect(env.timers[0].ms).toBe(30_000);
    env.hidden = false;
    watch.reschedule();
    expect(env.timers[0].ms).toBe(5_000);
  });

  test("watch(): reports the held request's row once, even if the poll saw it settle first", async () => {
    const { env, watch, tick, flush } = harness();
    await watch.start();
    let resolve!: (g: GenerationDto) => void;
    const request = new Promise<GenerationDto>((r) => (resolve = r));
    watch.watch(request, { clientId: "c1", clientName: "Ada" });
    expect(env.timers[0].ms).toBe(1_000);

    env.pending = [pendingRow()];
    await tick();
    expect(watch.watched).toEqual(["g1"]);

    env.pending = [];
    env.rows.g1 = gen();
    await tick();
    expect(watch.notices).toHaveLength(1);

    resolve(gen());
    await flush();
    expect(watch.notices).toHaveLength(1);
    expect(env.timers).toHaveLength(0);
  });

  test("watch(): a draft that finishes before any poll still notifies", async () => {
    const { env, watch, flush } = harness();
    await watch.start();
    await watch.watch(Promise.resolve(gen({ kind: "fill" })), { clientId: "c1", clientName: "Ada", href: "/x" });
    await flush();
    expect(watch.notices[0]).toMatchObject({ title: "Ada’s filled weeks are ready", href: "/x" });
    expect(env.timers).toHaveLength(0);
  });

  test("watch(): a failed request finds its row (failed or still pending)", async () => {
    const { env, watch, flush } = harness();
    await watch.start();
    env.gens = [gen({ status: "failed_validation", error: "bad JSON" })];
    await watch.watch(Promise.reject(new Error("request failed: 502")), { clientId: "c1", clientName: "Ada" }).catch(() => {});
    for (let i = 0; i < 5; i++) await flush();
    expect(watch.notices[0]).toMatchObject({ tone: "failed", reason: "bad JSON" });

    env.gens = [gen({ id: "g2", status: "pending" })];
    await watch.watch(Promise.reject(new Error("dropped")), { clientId: "c1", clientName: "Ada" }).catch(() => {});
    for (let i = 0; i < 5; i++) await flush();
    expect(watch.watched).toEqual(["g2"]);
    expect(env.timers).toHaveLength(1);
  });

  test("watch(): a superseded request never answers — only the latest one for that page does (B-04)", async () => {
    const { watch, flush } = harness();
    await watch.start();
    let settleFirst!: (g: GenerationDto) => void;
    let settleSecond!: (g: GenerationDto) => void;
    const first = watch.watch(new Promise<GenerationDto>((r) => (settleFirst = r)), { clientId: "c1", clientName: "Ada" });
    // Cancel, then Generate again: a second draft for the same page.
    const second = watch.watch(new Promise<GenerationDto>((r) => (settleSecond = r)), { clientId: "c1", clientName: "Ada" });
    const heard: string[] = [];
    void first.then((g) => heard.push(`first:${g.id}:${g.status}`));
    void second.then((g) => heard.push(`second:${g.id}:${g.status}`));

    // The cancelled draft's reply lands while the new one still runs: nobody hears "cancelled".
    settleFirst(gen({ id: "g1", status: "cancelled" }));
    for (let i = 0; i < 5; i++) await flush();
    expect(heard).toEqual([]);

    settleSecond(gen({ id: "g2", status: "validated" }));
    for (let i = 0; i < 5; i++) await flush();
    expect(heard).toEqual(["second:g2:validated"]);

    // Even when it lands after the new draft is done.
    let settleThird!: (g: GenerationDto) => void;
    const third = watch.watch(new Promise<GenerationDto>((r) => (settleThird = r)), { clientId: "c1", clientName: "Ada" });
    const fourth = watch.watch(Promise.resolve(gen({ id: "g4" })), { clientId: "c1", clientName: "Ada" });
    void third.then((g) => heard.push(`third:${g.id}`));
    await fourth;
    settleThird(gen({ id: "g3", status: "cancelled" }));
    for (let i = 0; i < 5; i++) await flush();
    expect(heard).toEqual(["second:g2:validated"]);
  });

  test("watch(): drafts on another page or client are not superseded", async () => {
    const { watch, flush } = harness();
    await watch.start();
    let settleBlock!: (g: GenerationDto) => void;
    const block = watch.watch(new Promise<GenerationDto>((r) => (settleBlock = r)), { clientId: "c1", clientName: "Ada" });
    void watch.watch(new Promise<GenerationDto>(() => {}), { clientId: "c1", clientName: "Ada", href: "/clients/c1/chat" });
    void watch.watch(new Promise<GenerationDto>(() => {}), { clientId: "c2", clientName: "Bo" });
    let heard: GenerationDto | null = null;
    void block.then((g) => (heard = g));
    settleBlock(gen({ id: "g1", status: "cancelled" }));
    for (let i = 0; i < 5; i++) await flush();
    expect(heard!).toMatchObject({ id: "g1", status: "cancelled" });
  });

  test("watch(): a superseded request that fails doesn't reject either", async () => {
    const { watch, flush } = harness();
    await watch.start();
    const first = watch.watch(Promise.reject(new Error("aborted")) as Promise<GenerationDto>, { clientId: "c1", clientName: "Ada" });
    void watch.watch(new Promise<GenerationDto>(() => {}), { clientId: "c1", clientName: "Ada" });
    let heard = "nothing";
    first.then(() => (heard = "resolved"), () => (heard = "rejected"));
    for (let i = 0; i < 5; i++) await flush();
    expect(heard).toBe("nothing");
  });

  test("dismiss removes one notice", async () => {
    const { watch, flush } = harness();
    await watch.start();
    await watch.watch(Promise.resolve(gen()), { clientId: "c1", clientName: "Ada" });
    await watch.watch(Promise.resolve(gen({ id: "g2" })), { clientId: "c1", clientName: "Ada" });
    await flush();
    expect(watch.notices.map((n) => n.id)).toEqual(["g2", "g1"]);
    watch.dismiss("g2");
    expect(watch.notices.map((n) => n.id)).toEqual(["g1"]);
  });
});
