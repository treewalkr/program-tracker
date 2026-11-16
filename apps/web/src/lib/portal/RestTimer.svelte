<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { t } from "./i18n.svelte";
  import { clock, secondsLeft } from "./restTimer";

  /**
   * Tap-to-start rest countdown for the log screen. Runs off an end time so it
   * stays right through a locked screen; holds a screen wake lock while it runs
   * where the browser offers one, and quietly does without where it doesn't.
   */
  let { seconds }: { seconds: number } = $props();

  let endsAt = $state<number | null>(null);
  let total = $state(0);
  let now = $state(Date.now());
  let finished = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let lock: { release(): Promise<void> } | null = null;

  const left = $derived(endsAt == null ? 0 : secondsLeft(endsAt, now));
  const running = $derived(endsAt != null && left > 0);

  async function holdScreen() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      lock = (await wl?.request("screen")) ?? null;
    } catch {
      lock = null; // denied, low battery, or unsupported: the timer still runs
    }
  }
  function letScreenSleep() {
    lock?.release().catch(() => {});
    lock = null;
  }

  function tick() {
    now = Date.now();
    if (endsAt != null && secondsLeft(endsAt, now) === 0) {
      stop();
      finished = true;
      try {
        navigator.vibrate?.([180, 80, 180]);
      } catch {
        // no vibration on this device
      }
    }
  }

  function start() {
    total = seconds;
    endsAt = Date.now() + seconds * 1000;
    now = Date.now();
    finished = false;
    timer ??= setInterval(tick, 250);
    void holdScreen();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    endsAt = null;
    letScreenSleep();
  }

  // the browser drops the wake lock when the tab hides; take it back on return
  function onVisible() {
    if (document.visibilityState !== "visible") return;
    tick();
    if (running && !lock) void holdScreen();
  }

  onDestroy(stop);
</script>

<svelte:document onvisibilitychange={onVisible} />

<div class="rest" class:running>
  {#if running}
    <div class="count" role="timer" aria-label={t("rest.left", { t: clock(left) })}>
      <span class="k">{t("rest.label")}</span>
      <span class="v tnum" aria-hidden="true">{clock(left)}</span>
    </div>
    <button type="button" class="btn stop" onclick={stop}>{t("rest.stop")}</button>
    <div class="bar" aria-hidden="true"><span style:width={`${(left / Math.max(1, total)) * 100}%`}></span></div>
  {:else}
    <button type="button" class="btn start" onclick={start}>
      <Icon name="timer" />{finished ? t("rest.again", { t: clock(seconds) }) : t("rest.start", { t: clock(seconds) })}
    </button>
  {/if}
  <p class="sr-only" role="status">{finished ? t("rest.done") : ""}</p>
  {#if finished}<p class="done" aria-hidden="true">{t("rest.done")}</p>{/if}
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
