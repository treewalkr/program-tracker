<script lang="ts">
  import { onMount } from "svelte";
  import { fmtDate } from "$lib/format";
  import { renderInlineMarkdown } from "$lib/markdown";
  import { releases, whatsNew } from "$lib/whatsNew.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Pill from "$lib/ui/Pill.svelte";

  // Opening the page is reading it: the sidebar dot clears.
  onMount(() => whatsNew.markSeen());

  /** Calendar day as written in CHANGELOG.md — parsed as local midnight so it never shifts a day. */
  const day = (iso: string) => fmtDate(`${iso}T00:00:00`);
</script>

<svelte:head><title>What's new · Program Tracker</title></svelte:head>

<PageHead title="What's new" sub="Changes to Program Tracker, newest first." />

{#if releases.length === 0}
  <EmptyState>Nothing released yet.</EmptyState>
{:else}
  <ol class="releases">
    {#each releases as release, i (release.version)}
      <li class="release" id="v{release.version}">
        <header class="meta">
          <h2 class="version">
            <a href="#v{release.version}">v{release.version}</a>
            {#if i === 0}<Pill tone="good">Latest</Pill>{/if}
          </h2>
          <time datetime={release.date}>{day(release.date)}</time>
        </header>
        <div class="notes">
          {#each release.sections as section, s (s)}
            <section class="section">
              {#if section.kind}<h3>{section.kind}</h3>{/if}
              <ul>
                {#each section.items as item, j (j)}
                  <li>{@html renderInlineMarkdown(item)}</li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .releases {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* GitHub-releases rhythm: version and date in a narrow column, notes at reading measure. */
  .release {
    display: grid;
    grid-template-columns: 168px minmax(0, 68ch);
    gap: 8px 32px;
    padding: 24px 0 28px;
    border-top: 1px solid var(--line-soft);
  }
  .release:first-child {
    border-top: 0;
    padding-top: 4px;
  }
  .meta {
    align-self: start;
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .version {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font: 600 14px/1.4 var(--font-mono);
  }
  .version a {
    color: var(--ink);
    text-decoration: none;
  }
  .version a:hover {
    color: var(--blue);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  time {
    font: 400 13px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  h3 {
    margin: 0 0 6px;
    font: 600 14px/1.4 var(--font-ui);
    color: var(--ink);
  }
  ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    font: 400 14px/1.55 var(--font-ui);
    color: var(--ink);
    text-wrap: pretty;
  }
  ul li::marker {
    color: var(--line-strong);
  }
  li :global(code) {
    font: 500 12px/1 var(--font-mono);
    background: var(--chip-bg);
    border-radius: var(--radius);
    padding: 2px 5px;
  }
  li :global(a) {
    color: var(--blue);
  }

  /* Narrow main column (rail or phone): version and date sit above the notes. */
  @container main (max-width: 640px) {
    .release {
      grid-template-columns: minmax(0, 1fr);
      padding: 20px 0 22px;
    }
    .meta {
      position: static;
      flex-direction: row;
      align-items: baseline;
      gap: 12px;
    }
  }
</style>
