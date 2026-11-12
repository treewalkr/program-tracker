<script lang="ts">
  import Note from "$lib/ui/Note.svelte";
  import { SEASON_WEEKS } from "$lib/loginTheme";
  import GoogleMark from "./GoogleMark.svelte";
  import TrainingBlock from "./TrainingBlock.svelte";

  /** Two panes: a training season drawn like a contributions graph, sign-in beside it. */
  interface Props {
    href: string;
    error: string | null;
  }

  let { href, error }: Props = $props();
</script>

<main class="login">
  <section class="hero" aria-label="Program Tracker">
    <div class="brand">
      <span class="mark" aria-hidden="true">PT</span>
      <span class="name">Program Tracker</span>
    </div>

    <figure class="season" aria-hidden="true">
      <TrainingBlock weeks={SEASON_WEEKS} axis="columns" cell={20} gap={4} />
      <figcaption class="legend">
        <span>12 weeks · 3 blocks</span>
        <span class="ramp">
          Less
          {#each [0, 1, 2, 3, 4] as level (level)}<i data-level={level}></i>{/each}
          More
        </span>
      </figcaption>
    </figure>

    <p class="claim">Every number on screen comes from a logged session.</p>
  </section>

  <section class="pane">
    <div class="form">
      <h1>Sign in to your workspace</h1>
      <p class="lede">
        Program Tracker is invite-only. Sign in with the Google account your admin added — your first sign-in links it
        to your workspace.
      </p>

      {#if error}
        <Note tone="bad" role="alert" class="err">{error}</Note>
      {/if}

      <a class="google" {href}>
        <GoogleMark />
        Continue with Google
      </a>

      <p class="foot">Sessions last 30 days on this device.</p>
    </div>
  </section>
</main>

<style>
  .login {
    min-height: var(--login-min-h, 100vh);
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    background: var(--bg);
  }

  .hero {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 40px;
    padding: 40px 48px;
    background: var(--well);
    border-right: 1px solid var(--line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mark {
    width: 32px;
    height: 32px;
    border-radius: 99px;
    background: var(--hover-ink);
    color: var(--on-ink);
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.02em;
  }
  .name {
    font: 600 14px/1.25 var(--font-ui);
    color: var(--ink);
  }

  .season {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: fit-content;
    max-width: 100%;
  }
  .legend {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font: 400 11px/1.4 var(--font-ui);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ramp {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .ramp i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--well-2);
    outline: 1px solid var(--cell-edge);
    outline-offset: -1px;
  }
  .ramp i:first-child { margin-left: 3px; }
  .ramp i:last-child { margin-right: 3px; }
  .ramp i[data-level="1"] { background: var(--accent-1, var(--done-1)); }
  .ramp i[data-level="2"] { background: var(--accent-2, var(--done-2)); }
  .ramp i[data-level="3"] { background: var(--accent-3, var(--done-3)); }
  .ramp i[data-level="4"] { background: var(--accent-4, var(--done-4)); }

  .claim {
    margin: 0;
    max-width: 34ch;
    font: 400 13px/1.5 var(--font-ui);
    color: var(--muted);
  }

  .pane {
    display: grid;
    align-content: center;
    padding: 48px 40px;
  }
  .form {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h1 {
    margin: 0;
    font: 600 24px/1.2 var(--font-ui);
    letter-spacing: -0.015em;
    color: var(--ink);
    text-wrap: balance;
  }
  .lede {
    margin: 0;
    font: 400 14px/1.5 var(--font-ui);
    color: var(--muted);
  }
  .form :global(.err) {
    padding: 8px 12px;
    font-size: 13px;
  }

  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 10px;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font: 500 14px/20px var(--font-ui);
    text-decoration: none;
    box-shadow: var(--btn-lip);
    transition: background-color 120ms ease-out, border-color 120ms ease-out;
  }
  .google:hover {
    background: var(--well);
    border-color: var(--line-strong);
    text-decoration: none;
  }
  .google:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus);
  }
  .google :global(svg) {
    width: 18px;
    height: 18px;
    flex: none;
  }

  .foot {
    margin: 0;
    font: 400 12px/1.5 var(--font-ui);
    color: var(--muted);
  }

  /* Narrow: the season becomes a band above the form; the claim drops. */
  @container login (max-width: 760px) {
    .login {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .hero {
      gap: 20px;
      padding: 24px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
      --block-cell: 10px;
    }
    .claim { display: none; }
    .pane {
      align-content: start;
      padding: 32px 24px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .google { transition: none; }
  }
</style>
