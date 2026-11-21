<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputCopy from './InputCopy.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/09 Copy field',
    component: InputCopy,
    parameters: {
      docs: {
        description: {
          component:
            'A read-only value to hand off: the portal link, an invite code. The value is mono, shown whole and wraps — never ellipsised, so the trainer can check the link before pasting it into LINE. Clicking or tabbing to it selects it all. The joined Copy button turns into "Copied" with a check for 2s, announced politely; if the clipboard refuses, the text is selected and the error line says how to copy by hand.',
        },
      },
    },
  });

  const link = 'https://pt.pinroj.com/portal/c/ann-rattanakul?k=7f3a92c4e1b04d6f9a2e5b7c8d1f0a3b6e9c2d5f8a1b4e7c0d3f6a9b2e5c8d1f';

  async function refuse(): Promise<void> {
    throw new Error('NotAllowedError');
  }

  /** Press Copy with a clipboard that refuses, to show the fallback. */
  async function pressCopy({ canvasElement }: { canvasElement: HTMLElement }) {
    let btn: HTMLButtonElement | null = null;
    for (let i = 0; i < 50 && !btn; i++) {
      btn = canvasElement.querySelector('button');
      if (!btn) await new Promise((r) => setTimeout(r, 20));
    }
    btn?.click();
  }
</script>

<Story name="Portal link" asChild>
  <div style="max-width: 480px"><InputCopy label="Portal link" value={link} hint="Anyone with this link sees Ann's program. Send it in LINE." /></div>
</Story>

<Story name="Short code" asChild>
  <div style="max-width: 240px"><InputCopy label="Invite code" value="PT-4K9Q" /></div>
</Story>

<Story name="Copy failed" asChild play={pressCopy}>
  <div style="max-width: 480px"><InputCopy label="Portal link" value={link} copy={refuse} /></div>
</Story>
