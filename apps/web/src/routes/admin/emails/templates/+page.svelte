<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
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
  let view = $state<"html" | "text">("html");
  let frameHeight = $state(320);

  /** The URL hash is the selection, so links, back/forward and reloads all agree. */
  const selected = $derived(previews?.find((p) => p.id === page.url.hash.slice(1)) ?? previews?.[0] ?? null);
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
      ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:20px 24px 24px;background:#fff}</style></head><body>${selected.email.html}</body></html>`
      : "",
  );

  /** `Name <addr>` → its parts, for the envelope's From line. */
  function sender(raw: string): { name: string | null; address: string } {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
    return m ? { name: m[1].replace(/^"|"$/g, "") || null, address: m[2] } : { name: null, address: raw.trim() };
  }

  function fit(e: Event) {
    const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
    // The body's own box plus its 20px/24px margins: scrollHeight never shrinks below the frame.
    if (doc?.body) frameHeight = Math.ceil(doc.body.getBoundingClientRect().height) + 44;
  }

  async function load() {
    loadError = null;
    try {
      previews = await adminApi.emails();
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  onMount(() => {
    if (apiMode === "live") load();
  });
</script>

<svelte:head><title>Email templates · Program Tracker</title></svelte:head>

<PageHead title="Email templates" sub="What each email says and when it sends, rendered by the live templates with sample data" />

{#if apiMode !== "live"}
  <Note tone="warn">Emails are rendered by the server — switch to the live API to see them.</Note>
{:else if loadError}
  <Note tone="bad">
    Couldn't load the emails — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if !previews || !selected}
  <div class="layout">
    <SkeletonPanel rows={6} dense trail={false} label="Loading templates…" />
    <SkeletonPanel height={360} />
  </div>
{:else}
  {@const from = sender(selected.from)}
  <div class="layout">
    <nav class="list" aria-label="Templates">
      {#each groups as g (g.name)}
        <h2>{g.name}</h2>
        <ul>
          {#each g.items as p (p.id)}
            <li>
              <a
                href="#{p.id}"
                class:on={p.id === selected.id}
                aria-current={p.id === selected.id ? "true" : undefined}
              >
                {p.title}
              </a>
            </li>
          {/each}
        </ul>
      {/each}
      <p class="hint">
        Each person can turn these groups off in Settings, mute one ticket, or unsubscribe from the link in any email.
      </p>
    </nav>

    <Panel title={selected.title}>
      {#snippet act()}
        <span class="group-tag">{selected.group}</span>
      {/snippet}
      <dl class="meta">
        <dt>Sends when</dt>
        <dd>{selected.trigger}</dd>
        <dt>Goes to</dt>
        <dd>{selected.recipients}</dd>
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

      <div class="stage">
        <article class="mail" aria-label="Sample email">
          <header class="envelope">
            <p class="subject">{selected.email.subject}</p>
            <dl>
              <dt>From</dt>
              <dd>
                {#if from.name}<strong>{from.name}</strong> <span class="addr">&lt;{from.address}&gt;</span>{:else}{from.address}{/if}
                {#if selected.email.headers?.["List-Unsubscribe"]}
                  <span class="unsub" title="Mail apps show their own Unsubscribe button from the List-Unsubscribe header (one-click, RFC 8058).">Unsubscribe</span>
                {/if}
              </dd>
              <dt>To</dt>
              <dd>{selected.email.to}</dd>
            </dl>
          </header>
          {#if view === "html"}
            <div id="panel-html" role="tabpanel" aria-labelledby="fmt-html">
              <iframe
                title="{selected.title} email, HTML"
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                {srcdoc}
                style="height:{frameHeight}px"
                onload={fit}
              ></iframe>
            </div>
          {:else}
            <div id="panel-text" role="tabpanel" aria-labelledby="fmt-text">
              <pre>{selected.email.text}</pre>
            </div>
          {/if}
        </article>
      </div>

      {#if selected.email.headers}
        <details class="headers">
          <summary>Mail headers</summary>
          <pre>{Object.entries(selected.email.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}</pre>
        </details>
      {/if}
      <p class="foot">
        Sample people and ticket. Links go to the real app; the unsubscribe links carry a dummy token, so they open the
        “no longer valid” page.
      </p>
    </Panel>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }

  /* The list mirrors the sidebar nav: uppercase group labels, Well Gray Active selection. */
  .list {
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
  }
  .list h2 {
    margin: 0 0 6px;
    padding: 0 8px;
    font: 500 11px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .list ul + h2 { margin-top: 18px; }
  .list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .list a {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    border-radius: var(--radius);
    color: var(--ink);
    font: 400 14px/1.4 var(--font-ui);
    text-decoration: none;
    transition: background-color 120ms ease-out;
  }
  .list a:hover { background: var(--well-2); }
  .list a.on { background: var(--active); font-weight: 600; }
  .hint {
    margin: 20px 0 0;
    padding: 12px 8px 0;
    border-top: 1px solid var(--line-soft);
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }

  .group-tag { font-size: 12px; color: var(--muted); }

  .meta {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 8px 16px;
    margin: 0;
    padding: 14px 16px;
    font-size: 13px;
    max-width: 720px;
  }
  .meta dt { color: var(--muted); }
  .meta dd { margin: 0; color: var(--ink); }

  .tabs-wrap { padding: 0 16px; }
  .tabs-wrap :global(.tabs) { margin-bottom: 0; }

  /* The stage is a well; the email sits on it as a white sheet, as a mail app shows it. */
  .stage {
    padding: 20px 16px 24px;
    background: var(--well);
    border-bottom: 1px solid var(--line-soft);
  }
  .mail {
    max-width: 640px;
    margin: 0 auto;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .envelope {
    padding: 14px 24px 12px;
    border-bottom: 1px solid var(--line-soft);
  }
  .subject {
    margin: 0 0 8px;
    font: 600 16px/1.35 var(--font-ui);
    color: var(--ink);
    text-wrap: balance;
  }
  .envelope dl {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 2px 8px;
    margin: 0;
    font-size: 12px;
  }
  .envelope dt { color: var(--muted); }
  .envelope dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  .envelope strong { font-weight: 600; }
  .addr { color: var(--muted); }
  .unsub {
    margin-left: 6px;
    color: var(--muted);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: help;
  }
  iframe { display: block; width: 100%; border: 0; }
  .mail pre {
    margin: 0;
    padding: 20px 24px 24px;
    font: 12px/1.6 var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .headers { padding: 12px 16px 0; font-size: 12px; }
  .headers summary { color: var(--muted); cursor: pointer; width: max-content; }
  .headers summary:hover { color: var(--ink); }
  .headers pre {
    margin: 8px 0 0;
    padding: 10px 12px;
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    font: 12px/1.6 var(--font-mono);
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-all;
  }
  .foot { margin: 0; padding: 10px 16px 14px; font-size: 12px; color: var(--muted); }

  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; gap: 16px; }
    .list { position: static; }
    .hint { display: none; }
  }
  @media (max-width: 520px) {
    .meta { grid-template-columns: 1fr; gap: 2px; }
    .meta dd + dt { margin-top: 8px; }
    .stage { padding: 12px 8px 16px; }
    .envelope { padding: 12px 16px 10px; }
    .mail pre { padding: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .list a { transition: none; }
  }
</style>
