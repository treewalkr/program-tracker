<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import OverflowMenu from "./OverflowMenu.svelte";
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";

  const { Story } = defineMeta({
    title: "UI/OverflowMenu",
    component: OverflowMenu,
    parameters: {
      docs: {
        description: {
          component:
            "A ⋯ More button that opens a short action menu (ARIA menu: ↑↓ Home End, Esc or an outside tap closes, focus returns to the trigger). A native popover in the top layer, so cards and panels never clip it. Used per exercise card on the log sheet for Swap / Flag / Skip, with +Set left on the card.",
        },
      },
    },
  });

  const noop = () => {};
  const items = [
    { label: "Undo swap", icon: "undo" as const, hint: "Back squat", onselect: noop },
    { label: "Swap again", icon: "swap" as const, onselect: noop },
    { label: "Flag", icon: "flag" as const, hint: "pain · technique", onselect: noop },
    { label: "Skip exercise", icon: "skip" as const, onselect: noop },
  ];
</script>

<Story name="Card actions" asChild>
  <div style="display: flex; justify-content: flex-end; align-items: center; gap: 4px; max-width: 640px; padding: 8px 16px; border: 1px solid var(--line); border-radius: 6px;">
    <strong style="margin-right: auto">Goblet squat</strong>
    <Button variant="ghost" small type="button">
      {#snippet icon()}<Icon name="plus" />{/snippet}
      Set
    </Button>
    <OverflowMenu label="More actions for Goblet squat" text="More" {items} />
  </div>
</Story>

<Story name="Icon only" asChild>
  <OverflowMenu label="More actions" items={items.slice(1)} />
</Story>
