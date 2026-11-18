<script lang="ts">
  import type { PortalSession } from "@pt/shared";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import PortalSessionCard from "$lib/portal/PortalSessionCard.svelte";
  import { t } from "$lib/portal/i18n.svelte";
  import PhoneFrame from "./PhoneFrame.svelte";

  /** The client's This week screen: the coach named, the session in focus, one green action. */
  const set = (n: number, reps: number, kg: number | null, rpe: number, rest: number) => ({
    setNumber: n,
    type: "working" as const,
    reps,
    amrap: false,
    targetWeightKg: kg,
    targetRpe: rpe,
    restSeconds: rest,
  });
  const ex = (i: number, name: string, kg: number | null, reps: number, rpe: number, rest: number) => ({
    id: `fx-${i}`,
    exerciseId: `fxe-${i}`,
    exerciseName: name,
    order: i,
    prescribedSets: [1, 2, 3, 4].map((n) => set(n, reps, kg, rpe, rest)),
  });
  /** Illustrative session: the guide's own sample, not any client's data. */
  const session: PortalSession = {
    id: "fig-upper-a",
    name: "Upper A",
    kind: "exercises",
    seq: 1,
    weekday: 3,
    order: 1,
    typeName: "Strength",
    exercises: [
      ex(1, "Bench press", 80, 6, 8, 150),
      ex(2, "Chest-supported row", 60, 8, 8, 120),
      ex(3, "Overhead press", 45, 8, 7, 120),
      ex(4, "Lat pulldown", 55, 10, 8, 90),
      ex(5, "Cable curl", 20, 12, 8, 60),
    ],
    cardio: null,
    log: null,
  };
</script>

<PhoneFrame height={540}>
  <div class="col">
    <PortalBar coach="Ploy" />
    <h4>{t("header.hi", { name: "Nok" })}</h4>
    <p class="week">{t("header.week", { n: 3 })} · {t("week.progress", { done: 1, total: 4 })}</p>
    <h5>{t("week.nextUp")}</h5>
    <PortalSessionCard {session} logHref="/me/log/fig" focus />
    <p class="fold">{t("week.earlier")}</p>
  </div>
</PhoneFrame>

<style>
  .col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  /* the guide has its own language control; the drawn bar keeps just the coach */
  .col :global(.lang) { display: none; }
  h4 { margin: 8px 0 0; font: 600 24px/1.2 var(--font-ui); }
  .week { margin: 0 0 6px; font-size: 14px; color: var(--muted); }
  h5 { margin: 4px 0 0; font: 600 14px/1.3 var(--font-ui); }
  .fold { margin: 4px 0 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 14px; }
</style>
