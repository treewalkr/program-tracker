<script lang="ts">
  import Note from "$lib/ui/Note.svelte";
  import { SEASON_WEEKS } from "$lib/loginTheme";
  import GoogleMark from "./GoogleMark.svelte";
  import TrainingBlock from "./TrainingBlock.svelte";

  /**
   * Full-bleed Primer-dark canvas in both modes, big headline, the season
   * oversized and fading off the right edge. Colours are fixed (it's always
   * dark), taken from the dark palette in app.css.
   */
  interface Props {
    href: string;
    error: string | null;
  }

  let { href, error }: Props = $props();
</script>

<main class="login">
  <div class="copy">
    <span class="mark" aria-hidden="true">PT</span>
    <h1>Sign in to your workspace</h1>
    <p class="lede">
      Program Tracker is invite-only. Sign in with the Google account your admin added — your first sign-in links it to
      your workspace.
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

  <div class="art">
    <TrainingBlock weeks={SEASON_WEEKS} axis="columns" cell={28} gap={6} dark />
  </div>
</main>

<style>
  .login {
    min-height: var(--login-min-h, 100vh);
    display: grid;
    grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
    align-items: center;
    column-gap: 56px;
    padding: 56px clamp(24px, 8cqi, 112px);
    background: #0d1117;
    color: #f0f6fc;
    overflow: hidden;
  }

  .copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }

  .mark {
    width: 40px;
    height: 40px;
    border-radius: 99px;
    background: #f0f6fc;
    color: #0d1117;
    display: grid;
    place-items: center;
    font: 600 14px/1 var(--font-ui);
    letter-spacing: 0.02em;
  }

  h1 {
    margin: 12px 0 0;
    font: 600 clamp(32px, 5cqi, 52px)/1.06 var(--font-ui);
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .lede {
    margin: 0;
    max-width: 44ch;
    font: 400 16px/1.55 var(--font-ui);
    color: #9198a1;
  }

  .copy :global(.err) {
    padding: 10px 14px;
    font-size: 14px;
  }

  .google {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 12px 22px;
    border-radius: var(--radius);
    background: #f0f6fc;
    color: #0d1117;
    font: 600 15px/20px var(--font-ui);
    text-decoration: none;
    box-shadow: 0 8px 24px rgba(1, 4, 9, 0.6);
    transition: background-color 120ms ease-out, box-shadow 160ms ease-out;
  }
  .google:hover {
    background: #ffffff;
    text-decoration: none;
    box-shadow: 0 10px 28px rgba(1, 4, 9, 0.75);
  }
  .google:focus-visible {
    outline: none;
    box-shadow: 0 8px 24px rgba(1, 4, 9, 0.6), 0 0 0 3px rgba(68, 147, 248, 0.6);
  }
  .google :global(svg) {
    width: 20px;
    height: 20px;
    flex: none;
  }

  .foot {
    margin: 0;
    font: 400 12px/1.5 var(--font-ui);
    color: #9198a1;
  }

  .art {
    justify-self: start;
    mask-image: linear-gradient(to right, #000 55%, transparent);
  }

  /* Narrow: the season goes on top, smaller and unfaded; the copy follows. */
  @container login (max-width: 760px) {
    .login {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 32px;
      align-content: center;
      padding: 40px 24px;
    }
    .art {
      order: -1;
      --block-cell: 12px;
      mask-image: linear-gradient(to right, #000 70%, transparent);
    }
    .google {
      align-self: stretch;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .google { transition: none; }
  }
</style>
