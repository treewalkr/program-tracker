<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { apiMode } from "$lib/api";
  import { adminApi, type FeatureFlag } from "$lib/api/admin";
  import { fmtDateTime } from "$lib/format";
  import Panel from "$lib/ui/Panel.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const live = apiMode === "live";

  /** What each switch does, in the admin's words. */
  const INFO: Record<FeatureFlag["name"], { label: string; help: string; env: string }> = {
    impersonation: {
      label: "View as trainer",
      help: "Open the app as a trainer to see what they reported — from a ticket or the Trainers list. Read-only for 30 minutes unless you allow edits; every view lands in that trainer's access log, and a view from a ticket leaves one line in its thread.",
      env: "IMPERSONATION=off",
    },
  };
  const ONOFF = [
    { value: "off", label: "Off" },
    { value: "on", label: "On" },
  ] as const;

  /** undefined = loading, null = the API didn't answer. */
  let flags = $state<FeatureFlag[] | null | undefined>(undefined);
  let saving = $state<string | null>(null);
  let error = $state<string | null>(null);

  /** Optimistic: show the pick now, keep the server's answer, revert on error. */
  async function save(flag: FeatureFlag, on: boolean) {
    if (!flags) return;
    const prev = flags;
    flags = flags.map((f) => (f.name === flag.name ? { ...f, stored: on, enabled: on && !f.killed } : f));
    saving = flag.name;
    error = null;
    try {
      const next = await adminApi.setFlag(flag.name, on);
      flags = flags.map((f) => (f.name === next.name ? next : f));
      // the session carries the switches the rest of the app reads (the View as buttons)
      await invalidateAll();
    } catch (err) {
      flags = prev;
      error = (err as Error).message || "Could not save";
    } finally {
      saving = null;
    }
  }

  onMount(() => {
    if (!live) return;
    adminApi.flags().then(
      (f) => (flags = f),
      () => (flags = null),
    );
  });
</script>

{#if !live}
  <Note tone="warn">Features are switched on the server — use the live API to change them.</Note>
{:else if flags === undefined}
  <SkeletonPanel title="Features" height={96} />
{:else if flags === null}
  <Note tone="bad">Features aren't available right now.</Note>
{:else}
  <Panel title="Features" count={flags.length}>
    <ul class="flags">
      {#each flags as flag (flag.name)}
        {@const info = INFO[flag.name]}
        <li>
          <div class="what">
            <strong id="flag-{flag.name}">{info.label}</strong>
            <p class="muted">{info.help}</p>
            {#if flag.killed}
              <p class="killed">
                Forced off on the server by <code>{info.env}</code> — your choice here applies once that's removed.
              </p>
            {:else if flag.updatedAt}
              <p class="muted when">Last changed {fmtDateTime(flag.updatedAt)}</p>
            {/if}
          </div>
          <Segmented
            items={[...ONOFF]}
            value={flag.stored ? "on" : "off"}
            label={info.label}
            disabled={saving === flag.name}
            onchange={(v) => save(flag, v === "on")}
          />
        </li>
      {/each}
    </ul>
  </Panel>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
{/if}

<style>
  .flags {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .flags li {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    padding: 14px 16px;
    font-size: 13px;
  }
  .flags li + li {
    border-top: 1px solid var(--line-soft);
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .what strong {
    font: 600 14px/1.3 var(--font-ui);
  }
  .muted {
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
    max-width: 64ch;
  }
  .when {
    font-size: 12px;
  }
  .killed {
    margin: 2px 0 0;
    padding: 6px 10px;
    border: 1px solid var(--warn-line);
    border-radius: var(--radius);
    background: var(--warn-bg);
    color: var(--warn-ink);
    font-size: 12.5px;
    max-width: 64ch;
  }
  .killed code {
    font: 500 12px/1 var(--font-mono);
  }
  .err {
    color: var(--bad);
    font-size: 12px;
  }
  @media (max-width: 720px) {
    .flags li {
      flex-direction: column;
      gap: 10px;
    }
  }
</style>
