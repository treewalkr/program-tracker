<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";
  import type { SettingsGroup } from "$lib/settingsNav";

  /**
   * Settings' own section nav. A column beside the page when there's room
   * (GitHub's settings sidebar); a strip of tabs pinned to the top when the
   * settings container is narrow. Takes the path as a prop so it renders in
   * bun tests, which can't load `$app/*`.
   */
  interface Props {
    groups: SettingsGroup[];
    /** The current path; its item is marked as the page. */
    current: string;
  }

  let { groups, current }: Props = $props();
</script>

<nav class="rail" aria-label="Settings">
  {#each groups as g, i (g.label ?? `foot-${i}`)}
    {@const headId = g.label ? `settings-rail-${i}` : undefined}
    <div class={["group", !g.label && "foot", g.note && "fenced"]} data-group={g.label ?? "foot"}>
      {#if g.label}
        <p class="label" id={headId}>
          {g.label}
          {#if g.note}<span class="note">{g.note}</span>{/if}
        </p>
      {/if}
      <ul aria-labelledby={headId}>
        {#each g.items as s (s.href)}
          {@const on = s.href === current}
          <li>
            <a href={s.href} class:on aria-current={on ? "page" : undefined}>
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  /* Column: mirrors the app sidebar — uppercase group labels, Active Gray
     selection — plus Primer's blue edge on the current page. */
  .rail {
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    padding: 0 8px;
    font: 500 11px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .note {
    padding: 0 6px;
    border-radius: 99px;
    font-size: 10px;
    line-height: 16px;
    text-transform: none;
    letter-spacing: 0;
    background: var(--chip-bg);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .foot {
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);
  }
  a {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 8px;
    border-radius: var(--radius);
    color: var(--ink);
    font: 400 14px/1.4 var(--font-ui);
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 120ms ease-out;
  }
  a :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 1.75;
    flex: none;
  }
  a:hover { background: var(--well-2); text-decoration: none; }
  a:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  a.on { background: var(--active); font-weight: 600; }
  a.on::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: var(--blue);
  }

  /* Strip: one scrollable row of tabs, stuck under the top of the page. */
  @container settings (max-width: 720px) {
    .rail {
      top: 0;
      z-index: 5;
      flex-direction: row;
      align-items: center;
      gap: 0;
      margin: 0 -16px;
      padding: 8px 16px;
      overflow-x: auto;
      scrollbar-width: none;
      background: var(--bg);
      border-bottom: 1px solid var(--line-soft);
    }
    .rail::-webkit-scrollbar { display: none; }
    .group { display: flex; align-items: center; flex: none; }
    .label { display: none; }
    ul { flex-direction: row; gap: 4px; }
    /* Hairline between groups replaces the labels. */
    .group + .group,
    .foot {
      margin-left: 8px;
      padding: 0 0 0 8px;
      border-top: 0;
      border-left: 1px solid var(--line-soft);
    }
    a { min-height: 36px; padding: 0 10px; }
    a.on::before {
      left: 10px;
      right: 10px;
      top: auto;
      bottom: -9px;
      width: auto;
      height: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    a { transition: none; }
  }
</style>
