<script lang="ts">
  import Panel from "$lib/ui/Panel.svelte";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import { theme, PALETTES, type ThemePref, type PaletteId, type Mode } from "$lib/theme.svelte";

  const THEMES: { value: ThemePref; label: string; icon: IconName }[] = [
    { value: "system", label: "System", icon: "monitor" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];

  const PALETTE_GROUPS: { mode: Mode; title: string; pick: () => PaletteId; set: (id: PaletteId) => void }[] = [
    { mode: "light", title: "Light theme", pick: () => theme.lightTheme, set: theme.setLight },
    { mode: "dark", title: "Dark theme", pick: () => theme.darkTheme, set: theme.setDark },
  ];
</script>

<Panel title="Appearance">
  <div class="appearance">
    <div class="mode-row">
      <div class="theme-pick" role="radiogroup" aria-label="Mode">
        {#each THEMES as t (t.value)}
          <label class="theme-opt" class:on={theme.pref === t.value}>
            <input
              type="radio"
              name="theme"
              value={t.value}
              checked={theme.pref === t.value}
              onchange={() => theme.set(t.value)}
            />
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </label>
        {/each}
      </div>
      <p class="muted">
        {theme.pref === "system" ? "Matches your device setting." : "Saved for this browser."}
      </p>
    </div>

    {#each PALETTE_GROUPS as g (g.mode)}
      {@const headId = `palette-${g.mode}`}
      <div class="palette-group">
        <h3 id={headId}>
          {g.title}
          {#if theme.resolved === g.mode}<span class="in-use">In use</span>{/if}
        </h3>
        <div class="palette-pick" role="radiogroup" aria-labelledby={headId}>
          {#each PALETTES.filter((p) => p.mode === g.mode) as p (p.id)}
            <label class="palette-opt" class:on={g.pick() === p.id}>
              <input
                type="radio"
                name={headId}
                value={p.id}
                checked={g.pick() === p.id}
                onchange={() => g.set(p.id)}
              />
              <span class="swatch" style:--sw-bg={p.swatch.bg} style:--sw-ink={p.swatch.ink} aria-hidden="true">
                <span class="sw-line"></span>
                <span class="sw-line short"></span>
                <span class="sw-dots">
                  <span style:background={p.swatch.good}></span>
                  <span style:background={p.swatch.bad}></span>
                </span>
              </span>
              <span class="palette-name">{p.label}</span>
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</Panel>

<style>
  .appearance { display: flex; flex-direction: column; gap: 16px; padding: 14px 16px; font-size: 13px; }
  .mode-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; }
  .appearance .muted { color: var(--muted); margin: 0; }
  .theme-pick {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    background: var(--well-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .theme-opt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: calc(var(--radius) - 2px);
    color: var(--muted);
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out;
  }
  .theme-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .theme-opt :global(svg) { width: 14px; height: 14px; stroke-width: 1.6; }
  .theme-opt:hover { color: var(--ink); }
  .theme-opt.on { background: var(--well); color: var(--ink); font-weight: 600; box-shadow: 0 0 0 1px var(--line); }
  .theme-opt:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { .theme-opt { transition: none; } }

  .palette-group h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .in-use {
    padding: 0 6px;
    border-radius: 999px;
    font-weight: 500;
    font-size: 11px;
    line-height: 18px;
    color: var(--muted);
    background: var(--chip-bg);
  }
  .palette-pick { display: flex; flex-wrap: wrap; gap: 8px; }
  .palette-opt {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 116px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--muted);
    cursor: pointer;
    transition: border-color 120ms ease-out, color 120ms ease-out;
  }
  .palette-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .palette-opt:hover { color: var(--ink); border-color: var(--line-strong); }
  .palette-opt.on { color: var(--ink); font-weight: 600; border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue); }
  .palette-opt:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
  .swatch {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 44px;
    padding: 8px;
    border-radius: calc(var(--radius) - 2px);
    background: var(--sw-bg);
    box-shadow: inset 0 0 0 1px var(--cell-edge);
  }
  .sw-line { height: 4px; width: 70%; border-radius: 2px; background: var(--sw-ink); }
  .sw-line.short { width: 45%; opacity: 0.55; }
  .sw-dots { display: flex; gap: 4px; margin-top: auto; }
  .sw-dots span { width: 10px; height: 10px; border-radius: 50%; }
  .palette-name { padding: 0 2px; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .palette-opt { transition: none; } }
</style>
