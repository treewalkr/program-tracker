<script lang="ts">
  import { page } from "$app/state";
  import { authApi, safeReturnTo } from "$lib/api/auth";
  import Note from "$lib/ui/Note.svelte";

  const ERRORS: Record<string, string> = {
    not_allowed: "That Google account isn't the trainer on this workspace. Pick the account it was set up for.",
    unverified: "Google hasn't verified that account's email address yet.",
    cancelled: "Sign-in was cancelled before Google finished.",
    expired: "That sign-in attempt timed out. Start again.",
    google_failed: "Google didn't answer properly. Try again in a moment.",
    not_configured: "Google sign-in isn't set up on the server yet — see the README for the four env vars it needs.",
  };

  const error = $derived(page.url.searchParams.get("error"));
  const href = $derived(authApi.signInHref(safeReturnTo(page.url.searchParams.get("returnTo"))));

  // Decorative: four training weeks, the same green ramp as the block pulse.
  const weeks = [
    [2, 0, 3, 0, 2, 1, 0],
    [3, 0, 3, 0, 3, 2, 0],
    [3, 1, 4, 0, 4, 2, 0],
    [1, 0, 2, 0, 1, 0, 0],
  ];
</script>

<svelte:head><title>Sign in · Program Tracker</title></svelte:head>

<main class="login">
  <div class="box">
    <span class="mark" aria-hidden="true">PT</span>

    <div class="block" aria-hidden="true">
      {#each weeks as week, w (w)}
        {#each week as level, d (d)}
          <span class="day" data-level={level}></span>
        {/each}
      {/each}
    </div>

    <h1>Sign in to your workspace</h1>
    <p class="lede">
      Program Tracker is a private workspace for one trainer. Use the Google account it was set up for — your first
      sign-in links it to your clients and programs.
    </p>

    {#if error}
      <Note tone="bad" role="alert" class="err">{ERRORS[error] ?? "Sign-in didn't go through. Try again."}</Note>
    {/if}

    <a class="google" {href}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continue with Google
    </a>
  </div>

  <p class="foot">Sessions last 30 days on this device.</p>
</main>

<style>
  .login {
    min-height: 100vh;
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
    color: #fff;
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.02em;
  }

  .block {
    display: grid;
    grid-template-columns: repeat(7, 10px);
    grid-auto-rows: 10px;
    gap: 3px;
    margin-top: 4px;
  }
  .day {
    border-radius: 2px;
    background: var(--well-2);
    outline: 1px solid rgba(31, 35, 40, 0.04);
    outline-offset: -1px;
  }
  .day[data-level="1"] { background: var(--done-1); }
  .day[data-level="2"] { background: var(--done-2); }
  .day[data-level="3"] { background: var(--done-3); }
  .day[data-level="4"] { background: var(--done-4); }

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
  .google svg {
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
