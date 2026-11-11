<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SaveRecap from "./SaveRecap.svelte";
  import Button from "$lib/ui/Button.svelte";

  const { Story } = defineMeta({
    title: "Log/SaveRecap",
    component: SaveRecap,
    parameters: {
      docs: {
        description: {
          component:
            "After a session save, in the log sheet's save bar: what went in (sets, exercises, pain/technique flags, skips, swaps) and the way on — the next client with a session still open today as the one green action, else back to the overview. While the 10 s undo window runs, Undo sits beside the title and a hairline drains.",
        },
      },
    },
  });

  const next = {
    state: "ready" as const,
    client: { clientId: "c2", name: "Mai Tanaka", session: "Lower B", href: "/clients/c2/log?session=s2&date=2026-11-11" },
  };
</script>

<Story name="With undo and next client" asChild>
  <div style="max-width: 760px">
    <SaveRecap
      title="Upper A logged"
      counts="14 sets · 5 exercises"
      notes={[
        { tone: "bad", text: "Pain · Back squat" },
        { tone: "warn", text: "Technique · Romanian deadlift" },
        { tone: "muted", text: "Skipped Walking lunge" },
      ]}
      {next}
      drain={10}
    >
      {#snippet action()}
        <span style="font-size: 12px; color: var(--muted)">8 s</span>
        <Button small type="button">Undo</Button>
      {/snippet}
    </SaveRecap>
  </div>
</Story>

<Story name="Clean save, finding next" asChild>
  <div style="max-width: 760px">
    <SaveRecap title="Upper A logged" counts="12 sets · 4 exercises" next={{ state: "loading" }} />
  </div>
</Story>

<Story name="Clean save, next client" asChild>
  <div style="max-width: 760px">
    <SaveRecap title="Upper A logged" counts="12 sets · 4 exercises" {next} />
  </div>
</Story>

<Story name="Everyone logged" asChild>
  <div style="max-width: 760px">
    <SaveRecap
      title="Easy run logged"
      counts="counts toward this week's cardio"
      notes={[{ tone: "muted", text: "Replaced the Nov 9 log" }]}
      next={{ state: "ready", client: null }}
    />
  </div>
</Story>
