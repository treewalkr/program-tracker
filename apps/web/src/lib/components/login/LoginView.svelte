<script lang="ts">
  import type { LoginTheme } from "@pt/shared";
  import LoginClassic from "./LoginClassic.svelte";
  import LoginSplit from "./LoginSplit.svelte";
  import LoginBold from "./LoginBold.svelte";
  import LoginMinimal from "./LoginMinimal.svelte";

  /**
   * The login page in the admin's chosen layout and accent. The accent ramp
   * lands as --accent-1…4 (mode-aware) and --accent-dark-1…4 (always dark);
   * green sets no --accent-* so the layouts fall back to the palette's --done ramp.
   */
  interface Props {
    theme: LoginTheme;
    /** Google sign-in link. */
    href: string;
    /** What went wrong on the last attempt, already worded; null = nothing. */
    error: string | null;
  }

  let { theme, href, error }: Props = $props();
</script>

<div class="login-theme" data-variant={theme.variant} data-accent={theme.accent}>
  {#if theme.variant === "split"}
    <LoginSplit {href} {error} />
  {:else if theme.variant === "bold"}
    <LoginBold {href} {error} />
  {:else if theme.variant === "minimal"}
    <LoginMinimal {href} {error} />
  {:else}
    <LoginClassic {href} {error} />
  {/if}
</div>

<style>
  /* Container queries, not media queries: the admin preview renders this at desktop and phone widths in one window. */
  .login-theme {
    container: login / inline-size;
  }

  /* Accent ramps: Primer's public colour scales, light lightest-first; dark mode inverts (darkest = least), like --done. */
  .login-theme {
    --accent-dark-1: #0e4429;
    --accent-dark-2: #006d32;
    --accent-dark-3: #238636;
    --accent-dark-4: #2ea043;
  }
  .login-theme[data-accent="blue"] {
    --accent-1: #b6e3ff;
    --accent-2: #54aeff;
    --accent-3: #0969da;
    --accent-4: #0a3069;
    --accent-dark-1: #0c2d6b;
    --accent-dark-2: #1158c7;
    --accent-dark-3: #388bfd;
    --accent-dark-4: #79c0ff;
  }
  .login-theme[data-accent="purple"] {
    --accent-1: #d8b9ff;
    --accent-2: #a475f9;
    --accent-3: #8250df;
    --accent-4: #3e1f79;
    --accent-dark-1: #271052;
    --accent-dark-2: #6e40c9;
    --accent-dark-3: #a371f7;
    --accent-dark-4: #d2a8ff;
  }
  .login-theme[data-accent="orange"] {
    --accent-1: #ffb77c;
    --accent-2: #fb8f44;
    --accent-3: #bc4c00;
    --accent-4: #762c00;
    --accent-dark-1: #3d1300;
    --accent-dark-2: #9b4215;
    --accent-dark-3: #db6d28;
    --accent-dark-4: #ffa657;
  }
  :global([data-theme="dark"]) .login-theme:not([data-accent="green"]) {
    --accent-1: var(--accent-dark-1);
    --accent-2: var(--accent-dark-2);
    --accent-3: var(--accent-dark-3);
    --accent-4: var(--accent-dark-4);
  }
</style>
