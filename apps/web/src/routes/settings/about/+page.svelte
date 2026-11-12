<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";

  const webBuild = __APP_VERSION__;
  /** undefined while loading, null if the API didn't answer. */
  let apiBuild = $state<string | null | undefined>(undefined);

  onMount(() => {
    api.apiBuild().then(
      (b) => (apiBuild = b),
      () => (apiBuild = null)
    );
  });
</script>

<Panel title="About">
  <div class="about">
    <span class="label">Version</span>
    <span class="ver">{webBuild}</span>
    <span class="api" aria-live="polite">
      {#if apiBuild === undefined}
        <Skeleton shape="line" w="90px" h="10px" />
      {:else if apiBuild === null}
        <span class="dot bad" aria-hidden="true"></span>API not reachable
      {:else if apiBuild !== webBuild}
        <span class="dot warn" aria-hidden="true"></span>API on <span class="mono">{apiBuild}</span>
      {:else}
        <span class="dot good" aria-hidden="true"></span>API connected
      {/if}
    </span>
  </div>
  {#if apiBuild && apiBuild !== webBuild}
    <div class="pad mismatch">
      <Note tone="warn">The app and the API are on different builds. A deploy may still be rolling out — reload in a few minutes.</Note>
    </div>
  {/if}
</Panel>

<style>
  .pad { padding: 16px; }
  .pad.mismatch { padding-top: 0; }

  .about {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 14px 16px;
    font-size: 13px;
  }
  .about .label { color: var(--muted); }
  .about .ver { font-family: var(--font-mono); font-weight: 600; color: var(--ink); }
  .about .api {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }
  .about .mono { font-family: var(--font-mono); color: var(--warn-ink); }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .dot.good { background: var(--good); }
  .dot.warn { background: var(--warn); }
  .dot.bad { background: var(--bad); }
</style>
