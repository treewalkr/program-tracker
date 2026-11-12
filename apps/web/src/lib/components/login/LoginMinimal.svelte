<script lang="ts">
  import Note from "$lib/ui/Note.svelte";
  import { BLOCK_WEEKS } from "$lib/loginTheme";
  import GoogleMark from "./GoogleMark.svelte";
  import TrainingBlock from "./TrainingBlock.svelte";

  /** No card: one week of training as the only colour, the headline, the button. */
  interface Props {
    href: string;
    error: string | null;
  }

  let { href, error }: Props = $props();
</script>

<main class="login">
  <div class="col">
    <TrainingBlock weeks={[BLOCK_WEEKS[2]]} cell={8} gap={3} />
    <h1>Sign in to Program Tracker</h1>
    <p class="lede">Invite-only. Use the Google account your admin added.</p>

    {#if error}
      <Note tone="bad" role="alert" class="err">{error}</Note>
    {/if}

    <a class="google" {href}>
      <GoogleMark />
      Continue with Google
    </a>
  </div>
</main>

<style>
  .login {
    min-height: var(--login-min-h, 100vh);
    display: grid;
    place-content: center;
    padding: 40px 24px;
    background: var(--bg);
  }

  .col {
    width: min(320px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h1 {
    margin: 12px 0 0;
    font: 600 20px/1.25 var(--font-ui);
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .lede {
    margin: 0;
    font: 400 14px/1.5 var(--font-ui);
    color: var(--muted);
  }
  .col :global(.err) {
    padding: 8px 12px;
    font-size: 13px;
  }

  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 12px;
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

  @media (prefers-reduced-motion: reduce) {
    .google { transition: none; }
  }
</style>
