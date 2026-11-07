<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { apiMode } from "$lib/api";
  import { adminApi, type EmailPreview } from "$lib/api/admin";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  /**
   * Admin catalog of every notification email. The API renders each one with
   * the live templates from sample data, so what shows here is what sends.
   */

  let previews = $state<EmailPreview[] | null>(null);
  let loadError = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let view = $state<"html" | "text">("html");
  let frameHeight = $state(320);

  const selected = $derived(previews?.find((p) => p.id === selectedId) ?? previews?.[0] ?? null);
  const groups = $derived.by(() => {
    const out: { name: EmailPreview["group"]; items: EmailPreview[] }[] = [];
    for (const p of previews ?? []) {
      const g = out.find((x) => x.name === p.group);
      if (g) g.items.push(p);
      else out.push({ name: p.group, items: [p] });
    }
    return out;
  });
  /** Links open in a new tab; the iframe allows popups but no scripts. */
  const srcdoc = $derived(
    selected
      ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:20px;background:#fff}</style></head><body>${selected.email.html}</body></html>`
      : "",
  );

  function select(id: string) {
    selectedId = id;
    const url = new URL(page.url);
    url.hash = id;
    replaceState(url, page.state);
  }

  function fit(e: Event) {
    const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
    if (doc) frameHeight = Math.max(200, doc.documentElement.scrollHeight);
  }

  async function load() {
    loadError = null;
    try {
      previews = await adminApi.emails();
      const fromHash = page.url.hash.slice(1);
      if (previews.some((p) => p.id === fromHash)) selectedId = fromHash;
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  onMount(() => {
    if (apiMode === "live") load();
  });
</script>

<svelte:head><title>Notification emails · Program Tracker</title></svelte:head>

<PageHead title="Notification emails" sub="Every email the app sends, rendered by the live templates with sample data" />

{#if apiMode !== "live"}
  <Note tone="warn">Emails are rendered by the server — switch to the live API to see them.</Note>
{:else if loadError}
  <Note tone="bad">
    Couldn't load the emails — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if !previews || !selected}
  <SkeletonPanel />
{:else}
  <div class="layout">
    <nav class="list" aria-label="Emails">
      {#each groups as g (g.name)}
        <h2>{g.name}</h2>
        <ul>
          {#each g.items as p (p.id)}
            <li>
              <button type="button" class:on={p.id === selected.id} aria-current={p.id === selected.id} onclick={() => select(p.id)}>
                {p.title}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
      <p class="hint">
        Each person can turn these groups off in Settings, mute one ticket, or unsubscribe from the link in any email.
      </p>
    </nav>

    <Panel title={selected.title}>
      <dl class="meta">
        <dt>Sends when</dt>
        <dd>{selected.trigger}</dd>
        <dt>Goes to</dt>
        <dd>{selected.recipients}</dd>
        <dt>Subject</dt>
        <dd class="subject">{selected.email.subject}</dd>
        {#if selected.email.headers}
          <dt>Headers</dt>
          <dd class="mono">
            {#each Object.entries(selected.email.headers) as [k, v] (k)}
              <div>{k}: {v}</div>
            {/each}
          </dd>
        {/if}
      </dl>

      <div class="tabs-wrap">
        <Tabs
          label="Email format"
          idPrefix="fmt"
          value={view}
          items={[
            { id: "html", label: "HTML" },
            { id: "text", label: "Plain text" },
          ]}
          onchange={(id) => (view = id as "html" | "text")}
        />
      </div>

      {#if view === "html"}
        <div id="panel-html" role="tabpanel" aria-labelledby="fmt-html" class="canvas">
          <iframe
            title="{selected.title} email, HTML"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            {srcdoc}
            style="height:{frameHeight}px"
            onload={fit}
          ></iframe>
        </div>
      {:else}
        <div id="panel-text" role="tabpanel" aria-labelledby="fmt-text" class="canvas">
          <pre>{selected.email.text}</pre>
        </div>
      {/if}
      <p class="foot">Sample data. Unsubscribe links carry a dummy token, so they show the “no longer valid” page.</p>
    </Panel>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
  }

  .list { position: sticky; top: 16px; }
  .list h2 {
    margin: 14px 0 4px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .list h2:first-child { margin-top: 0; }
  .list ul { list-style: none; margin: 0; padding: 0; }
  .list button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .list button:hover { background: var(--hover-soft); }
  .list button.on { background: var(--hover-soft); font-weight: 600; box-shadow: inset 2px 0 0 var(--blue); }
  .list button:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
  .hint { margin: 16px 8px 0; font-size: 12px; color: var(--muted); }

  .meta {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 6px 12px;
    margin: 0;
    padding: 14px 16px;
    font-size: 13px;
    border-bottom: 1px solid var(--line-soft);
  }
  .meta dt { color: var(--muted); }
  .meta dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  .meta .subject { font-weight: 600; }
  .meta .mono { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }

  .tabs-wrap { padding: 0 16px; }
  .canvas {
    margin: 0 16px;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }
  iframe { display: block; width: 100%; border: 0; }
  pre {
    margin: 0;
    padding: 16px 20px;
    font: 12px/1.6 var(--font-mono);
    color: #1f2328;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .foot { margin: 0; padding: 10px 16px 14px; font-size: 12px; color: var(--muted); }
</style>
