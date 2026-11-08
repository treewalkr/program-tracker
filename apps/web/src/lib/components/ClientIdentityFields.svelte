<script lang="ts">
  import { emailError, nameError } from "$lib/clientProfile";
  import Field from "$lib/ui/Field.svelte";
  import { PHONE_MAX } from "@pt/shared";

  /**
   * Name, email and phone (contact details) with per-field validation. Errors show once a field is left
   * (blur) or when the parent sets `showAll` after a submit attempt.
   */
  let {
    name = $bindable(),
    email = $bindable(),
    phone = $bindable(),
    idPrefix,
    showAll = false,
  }: { name: string; email: string; phone: string; idPrefix: string; showAll?: boolean } = $props();

  let touched = $state({ name: false, email: false });
  const nErr = $derived(touched.name || showAll ? nameError(name) : null);
  const eErr = $derived(touched.email || showAll ? emailError(email) : null);
</script>

<div class="who-fields">
  <Field label="Name" htmlFor="{idPrefix}-name" hint="required">
    <input
      class="input"
      id="{idPrefix}-name"
      bind:value={name}
      maxlength="120"
      autocomplete="off"
      aria-required="true"
      aria-invalid={nErr ? "true" : undefined}
      aria-describedby={nErr ? `${idPrefix}-name-err` : undefined}
      onblur={() => (touched.name = true)}
    />
    {#if nErr}<p class="ferr" id="{idPrefix}-name-err">{nErr}</p>{/if}
  </Field>
  <Field label="Email" htmlFor="{idPrefix}-email" hint="optional">
    <input
      class="input"
      id="{idPrefix}-email"
      type="email"
      inputmode="email"
      bind:value={email}
      maxlength="200"
      autocomplete="off"
      aria-invalid={eErr ? "true" : undefined}
      aria-describedby={eErr ? `${idPrefix}-email-err` : undefined}
      onblur={() => (touched.email = true)}
    />
    {#if eErr}<p class="ferr" id="{idPrefix}-email-err">{eErr}</p>{/if}
  </Field>
  <Field label="Phone" htmlFor="{idPrefix}-phone" hint="optional">
    <input class="input" id="{idPrefix}-phone" type="tel" inputmode="tel" bind:value={phone} maxlength={PHONE_MAX} autocomplete="off" />
  </Field>
</div>

<style>
  .who-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
  .ferr { margin: 4px 0 0; font: 500 13px var(--font-ui); color: var(--bad); }
  .input[aria-invalid="true"] { border-color: var(--bad); }
  @media (max-width: 700px) {
    .who-fields { grid-template-columns: minmax(0, 1fr); }
  }
</style>
