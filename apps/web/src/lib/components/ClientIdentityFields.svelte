<script lang="ts">
  import { emailError, nameError } from "$lib/clientProfile";
  import InputField from "$lib/ui/InputField.svelte";
  import { PHONE_MAX } from "@pt/shared";

  /**
   * Name, email and phone (contact details) with per-field validation. Errors show once a field the user
   * typed in is left (blur), or when the parent sets `showAll` after a submit attempt. Leaving an untouched
   * field (the autofocused name, a tab switch) shows nothing.
   */
  let {
    name = $bindable(),
    email = $bindable(),
    phone = $bindable(),
    idPrefix,
    showAll = false,
  }: { name: string; email: string; phone: string; idPrefix: string; showAll?: boolean } = $props();

  let edited = $state({ name: false, email: false });
  let touched = $state({ name: false, email: false });
  const nErr = $derived(touched.name || showAll ? nameError(name) : null);
  const eErr = $derived(touched.email || showAll ? emailError(email) : null);
</script>

<div class="who-fields">
  <InputField
    label="Name"
    id="{idPrefix}-name"
    bind:value={name}
    maxlength={120}
    autocomplete="off"
    error={nErr}
    oninput={() => (edited.name = true)}
    onblur={() => (touched.name = edited.name)}
  />
  <InputField
    label="Email"
    id="{idPrefix}-email"
    type="email"
    inputmode="email"
    optional
    bind:value={email}
    maxlength={200}
    autocomplete="off"
    error={eErr}
    oninput={() => (edited.email = true)}
    onblur={() => (touched.email = edited.email)}
  />
  <InputField label="Phone" id="{idPrefix}-phone" type="tel" inputmode="tel" optional bind:value={phone} maxlength={PHONE_MAX} autocomplete="off" />
</div>

<style>
  .who-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  @media (max-width: 700px) {
    .who-fields { grid-template-columns: minmax(0, 1fr); }
  }
</style>
