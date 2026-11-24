<script lang="ts" module>
  import { idleRest, restIn, restRunning, type RestRun } from "./restTimer";

  /** The rest in progress, outside any one timer: paging away and back finds it still counting. */
  let run = $state<RestRun>(idleRest(null));

  /** A rest is counting down in `session`: the log keeps the timer on screen until it ends. */
  export const restActive = (session: string): boolean => restRunning(restIn(run, session), Date.now());
</script>

<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { t } from "./i18n.svelte";
  import { clock, secondsLeft, startRest } from "./restTimer";

  /**
   * Tap-to-start rest countdown for the log screen. Runs off an end time so it
   * stays right through a locked screen; holds a screen wake lock while it runs
   * where the browser offers one, and quietly does without where it doesn't.
   * One rest per session: a new session starts with none.
   */
  let { seconds, session }: { seconds: number; session: string } = $props();

  type Sentinel = { released?: boolean; release(): Promise<void>; addEventListener?(type: "release", fn: () => void): void };
  type WakeLock = { request(type: "screen"): Promise<Sentinel> };

  const mine = $derived(restIn(run, session));
  let now = $state(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  let lock: Sentinel | null = null;
  /** A wake-lock request is out: don't send another. */
  let asking = false;

  const left = $derived(mine.endsAt == null ? 0 : secondsLeft(mine.endsAt, now));
  const running = $derived(mine.endsAt != null && left > 0);

  async function holdScreen() {
    if (asking || (lock && !lock.released)) return;
    asking = true;
    try {
      const got = (await (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock?.request("screen")) ?? null;
      // stopped (or finished) while the request was out: hand it straight back
      if (got && !restRunning(run, Date.now())) {
        got.release().catch(() => {});
        return;
      }
      lock = got;
      // the browser lets go whenever the tab hides: forget it, so coming back asks again
      got?.addEventListener?.("release", () => {
        if (lock === got) lock = null;
      });
    } catch {
      lock = null; // denied, low battery, or unsupported: the timer still runs
    } finally {
      asking = false;
    }
  }
  function letScreenSleep() {
    lock?.release().catch(() => {});
    lock = null;
  }

  function ticking() {
    timer ??= setInterval(tick, 250);
  }

  function tick() {
    now = Date.now();
    if (mine.endsAt != null && secondsLeft(mine.endsAt, now) === 0) {
      stop();
      run = { ...run, finished: true };
      try {
        navigator.vibrate?.([180, 80, 180]);
      } catch {
        // no vibration on this device
      }
    }
  }

  function start() {
    now = Date.now();
    run = startRest(session, seconds, now);
    ticking();
    void holdScreen();
  }

  /** Let go of this timer's interval and lock; the rest itself carries on. */
  function release() {
    if (timer) clearInterval(timer);
    timer = null;
    letScreenSleep();
  }

  function stop() {
    release();
    run = { ...restIn(run, session), endsAt: null };
  }

  // mounted mid-rest (paged back to it, or reopened the session): pick the countdown up
  $effect(() => {
    if (!restRunning(mine, Date.now())) return;
    now = Date.now();
    ticking();
    void holdScreen();
  });

  // the browser drops the wake lock when the tab hides; take it back on return
  function onVisible() {
    if (document.visibilityState !== "visible") return;
    tick();
    if (running && (!lock || lock.released)) void holdScreen();
  }

  onDestroy(release);
</script>

<svelte:document onvisibilitychange={onVisible} />

<div class="rest" class:running>
  {#if running}
    <div class="count" role="timer" aria-label={t("rest.left", { t: clock(left) })}>
      <span class="k">{t("rest.label")}</span>
      <span class="v tnum" aria-hidden="true">{clock(left)}</span>
    </div>
    <button type="button" class="btn stop" onclick={stop}>{t("rest.stop")}</button>
    <div class="bar" aria-hidden="true"><span style:width={`${(left / Math.max(1, mine.total)) * 100}%`}></span></div>
  {:else}
    <button type="button" class="btn start" onclick={start}>
      <Icon name="timer" />{mine.finished ? t("rest.again", { t: clock(seconds) }) : t("rest.start", { t: clock(seconds) })}
    </button>
  {/if}
  <p class="sr-only" role="status">{mine.finished ? t("rest.done") : ""}</p>
  {#if mine.finished}<p class="done" aria-hidden="true">{t("rest.done")}</p>{/if}
</div>

<style>
  .rest { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px 12px; }
  .start { grid-column: 1 / -1; justify-content: center; min-height: 48px; font-size: 16px; }
  .start :global(svg) { width: 16px; height: 16px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .k { font-size: 14px; color: var(--muted); }
  .v { font: 600 28px/1 var(--font-mono); letter-spacing: -0.01em; }
  .stop { min-height: 44px; }
  .bar { grid-column: 1 / -1; height: 6px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 99px; background: var(--blue); transition: width 250ms linear; }
  .done { grid-column: 1 / -1; margin: 0; font-size: 14px; font-weight: 500; color: var(--good); }
  @media (prefers-reduced-motion: reduce) {
    .bar span { transition: none; }
  }
</style>
