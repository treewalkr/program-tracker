<script lang="ts">
  import Note from "$lib/ui/Note.svelte";
  import { BLOCK_WEEKS } from "$lib/loginTheme";
  import GoogleMark from "./GoogleMark.svelte";
  import TrainingBlock from "./TrainingBlock.svelte";

  /** The original login page: centered card, PT mark, one training block. */
  interface Props {
    href: string;
    error: string | null;
  }

  let { href, error }: Props = $props();
</script>

<main class="login">
  <div class="box">
    <span class="mark" aria-hidden="true">PT</span>

    <TrainingBlock weeks={BLOCK_WEEKS} class="block" />

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
  </div>

  <p class="foot">Sessions last 30 days on this device.</p>
</main>

<style>
  .login {
    min-height: var(--login-min-h, 100vh);
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    padding: 40px 16px;
    background: var(--well);
  }

  .box {
    width: min(380px, 100%);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 28px 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
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

  .box :global(.block) {
    margin-top: 4px;
  }

  h1 {
    margin: 4px 0 0;
    font: 600 20px/1.25 var(--font-ui);
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .lede {
    margin: 0;
    font: 400 14px/1.5 var(--font-ui);
    color: var(--muted);
  }

  .box :global(.err) {
    padding: 8px 12px;
    font-size: 13px;
  }

  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 6px;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font: 500 14px/20px var(--font-ui);
    text-decoration: none;
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

  @media (prefers-reduced-motion: reduce) {
    .google { transition: none; }
  }
</style>
