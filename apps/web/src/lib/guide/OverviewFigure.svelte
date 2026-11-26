<script lang="ts">
  import CopyButton from "$lib/components/CopyButton.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import Panel from "$lib/ui/Panel.svelte";

  /** The Overview "Members" table: its Portal column is a shortcut (sample rows). */
  const rows = [
    { name: "Mali", program: "Full body 3x", on: false },
    { name: "Nok", program: "Upper / Lower", on: true },
  ];
  const note = {
    en: [
      ["Not turned on", "Turn on… opens that member's Settings tab."],
      ["Turned on", "Copy link copies their personal link."],
    ],
    th: [
      ["ยังไม่เปิด", "กด Turn on… เพื่อไปแท็บ Settings ของเมมเบอร์คนนั้น"],
      ["เปิดแล้ว", "กด Copy link เพื่อคัดลอกลิงก์ส่วนตัวของเมมเบอร์"],
    ],
  } as const;
  const legend = $derived(note[i18n.locale]);
</script>

<div class="wrap">
  <Panel title="Members" count={2}>
    <table>
      <thead>
        <tr><th>Member</th><th>Status</th><th class="portal">Portal</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr>
            <td><span class="name">{r.name}</span><div class="sub">{r.program}</div></td>
            <td><StatusPill status="active" /></td>
            <td class="portal">
              <span class="cell">
                <span class="badge" aria-hidden="true">{r.on ? 2 : 1}</span>
                {#if r.on}
                  <CopyButton text="https://app.example.com/me/link/k3Qx…9fA2" label="Copy link" quiet />
                {:else}
                  <span class="on">Turn on…</span>
                {/if}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <ol class="legend">
      {#each legend as [h, p], i (i)}
        <li><span class="badge" aria-hidden="true">{i + 1}</span><span><b>{h}.</b> {p}</span></li>
      {/each}
    </ol>
  </Panel>
</div>

<style>
  .wrap { width: 100%; max-width: 560px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 7px 12px; font: 600 12px/1.2 var(--font-ui); color: var(--muted); background: var(--well); border-bottom: 1px solid var(--line-soft); }
  td { padding: 9px 12px; vertical-align: middle; border-top: 1px solid var(--line-soft); }
  tbody tr:first-child td { border-top: 0; }
  .portal { text-align: right; white-space: nowrap; background: color-mix(in srgb, var(--blue) 6%, transparent); }
  th.portal { background: color-mix(in srgb, var(--blue) 10%, var(--well)); color: var(--ink); }
  .name { font-weight: 500; }
  .sub { font-size: 13px; color: var(--muted); }
  .cell { display: inline-flex; align-items: center; gap: 8px; }
  .on { font: 400 13px/1 var(--font-ui); color: var(--blue); }
  .badge { display: inline-grid; place-items: center; flex: none; width: 18px; height: 18px; border-radius: 50%; background: var(--ink); color: var(--surface); font: 600 11px/1 var(--font-mono); }
  .legend { list-style: none; margin: 0; padding: 10px 12px 12px; display: grid; gap: 6px; border-top: 1px solid var(--line-soft); font-size: 13px; line-height: 1.5; }
  .legend li { display: flex; gap: 8px; align-items: baseline; }
  .legend .badge { transform: translateY(3px); }
</style>
