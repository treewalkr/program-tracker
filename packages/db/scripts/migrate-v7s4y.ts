import { eq } from "drizzle-orm";
import {
  applyDefaultWeekdays,
  LegacyProgramSession,
  ProgramWeeksDocument,
  type Phasing,
  type ProgramDay,
  type ProgramSession,
  type ProgramWeek,
} from "@pt/shared";
import { clients, db, programs } from "../src";

export function migrateProgramDocument(
  legacy: any,
  phasing: Phasing | null,
  trainingDays?: number[] | null
): ProgramWeek[] {
  const alreadyMigrated = ProgramWeeksDocument.safeParse(legacy);
  if (alreadyMigrated.success) {
    return alreadyMigrated.data;
  }

  const legacySessions = LegacyProgramSession.array().parse(legacy);

  const week1Days: ProgramDay[] = legacySessions.map((s, i) => {
    const liftingSession: ProgramSession = {
      id: s.id,
      name: s.name,
      order: 0,
      kind: "lifting",
      notes: s.notes,
      exercises: s.exercises.map((e, ei) => ({ ...e, order: ei })),
      cardio: null,
    };
    const sessions: ProgramSession[] = [liftingSession];

    if (s.conditioning) {
      sessions.push({
        id: crypto.randomUUID(),
        name: s.conditioning.label,
        order: 1,
        kind: "cardio",
        exercises: [],
        cardio: {
          modality: s.conditioning.label,
          intensity: s.conditioning.detail.slice(0, 60),
        },
      });
    }

    return {
      id: crypto.randomUUID(),
      day: i + 1,
      weekday: null,
      sessions,
    };
  });

  const totalWeeks = phasing?.plannedWeeks ?? 4;
  const weeks: ProgramWeek[] = [{ week: 1, days: week1Days }];

  for (let w = 2; w <= totalWeeks; w++) {
    weeks.push({
      week: w,
      days: week1Days.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        sessions: d.sessions.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          exercises: s.exercises.map((e) => ({
            ...e,
            id: crypto.randomUUID(),
          })),
        })),
      })),
    });
  }

  return applyDefaultWeekdays(weeks, trainingDays);
}

export async function main() {
  const rows = await db
    .select({
      id: programs.id,
      sessions: programs.sessions,
      phasing: programs.phasing,
      trainingDays: clients.trainingDays,
    })
    .from(programs)
    .leftJoin(clients, eq(programs.clientId, clients.id));

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (ProgramWeeksDocument.safeParse(row.sessions).success) {
      skipped++;
      continue;
    }

    const legacyParsed = LegacyProgramSession.array().safeParse(row.sessions);
    if (!legacyParsed.success) {
      skipped++;
      continue;
    }

    const reshaped = migrateProgramDocument(
      legacyParsed.data,
      row.phasing ?? null,
      row.trainingDays
    );

    await db
      .update(programs)
      .set({ sessions: reshaped })
      .where(eq(programs.id, row.id));

    migrated++;
  }

  console.log(`✓ v7s4y: migrated ${migrated} programs, skipped ${skipped}`);
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}
