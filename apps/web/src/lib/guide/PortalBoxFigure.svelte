<script lang="ts">
  import Button from "$lib/ui/Button.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import ProfileSection from "$lib/components/ProfileSection.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import { lineMessage } from "$lib/portal/lineMessage";

  /** The trainer's Client portal box once it's on, drawn with sample data (illustrative link and client). */
  const link = "https://app.example.com/me/link/k3Qx…9fA2";
</script>

<div class="box">
  <ProfileSection title="Client portal" purpose="their own link to see this week and log sessions">
    <div class="field">
      <span class="label">Access link</span>
      <div class="link-row">
        <code class="link">{link}</code>
        <Button small type="button">Copy link</Button>
      </div>
    </div>
    <div class="field">
      <div class="label-row">
        <span class="label">For LINE</span>
        <Segmented label="Message language" items={[{ value: "en", label: "EN" }, { value: "th", label: "ไทย" }]} value={i18n.locale} onchange={() => {}} />
      </div>
      <div class="link-row">
        <span class="msg" lang={i18n.locale}>{lineMessage(i18n.locale, "Nok", link)}</span>
        <Button small type="button">Copy message</Button>
      </div>
    </div>
    <dl class="facts">
      <div><dt>Google sign-in</dt><dd>Uses nok@example.com</dd></div>
      <div><dt>Last seen</dt><dd>Not opened yet</dd></div>
    </dl>
    <div class="acts">
      <Button small type="button">Reset link</Button>
      <Button small type="button">Turn off</Button>
    </div>
  </ProfileSection>
</div>

<style>
  .box { width: 100%; max-width: 560px; background: var(--surface); }
  .field { display: grid; gap: 6px; }
  .label { font-size: 12px; font-weight: 600; color: var(--muted); }
  .label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .link-row { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  .link, .msg { flex: 1; min-width: 0; padding: 6px 10px; overflow-wrap: anywhere; font-size: 13px; line-height: 1.5; background: var(--well); border: 1px solid var(--line); border-radius: var(--radius); }
  .link { font-family: var(--font-mono); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 0; }
  .facts dt { font-size: 12px; font-weight: 600; color: var(--muted); }
  .facts dd { margin: 2px 0 0; font-size: 13px; }
  .acts { display: flex; justify-content: flex-end; gap: 8px; }
</style>
