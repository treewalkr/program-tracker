import { ImportChunk, type ImportChunkRange } from "../import";

/**
 * FB-015: the real chunk outputs (DeepSeek, prod `llm_calls.parsed`) for
 * fixtures/import/fb-015-ab.txt — a trainer's alternating program pasted as
 * Week 1 and Week 2, read before the A/B pick existed (import a4bb7aab). The
 * values are kept verbatim; exercise matches come later, from matchExercise.
 */
export const FB015_CHUNKS: (ImportChunkRange & { data: ImportChunk })[] = [
  // llm_calls 8b2b0d8d…, lines 1–2
  {
    from: 1,
    to: 2,
    data: ImportChunk.parse({
      weeks: [
        {
          days: [],
          line: null,
          label: null
        }
      ],
      skipped: [
        {
          line: 1,
          reason: "training method note, not a week, day, session, or exercise"
        },
        {
          line: 2,
          reason: "incomplete note, not training"
        }
      ],
      newTerms: []
    }),
  },
  // llm_calls 240cb06b…, lines 3–18
  {
    from: 3,
    to: 18,
    data: ImportChunk.parse({
      weeks: [
        {
          days: [
            {
              line: 4,
              label: "Day 1 Push",
              sessions: [
                {
                  kind: "exercises",
                  line: 4,
                  name: "Push",
                  exercises: [
                    {
                      line: 5,
                      name: "Burpee to Throwball",
                      sourceName: "Burpee to Throwball",
                      prescription: {
                        reps: 10,
                        sets: 3
                      }
                    },
                    {
                      line: 6,
                      name: "Sled push",
                      notes: "20m",
                      sourceName: "Sled push",
                      prescription: {
                        sets: 3
                      }
                    },
                    {
                      line: 8,
                      name: "Squat",
                      group: "A",
                      notes: "40 kg; Superset x 3 sets",
                      sourceName: "Squat",
                      prescription: {
                        reps: 10,
                        sets: 3
                      }
                    },
                    {
                      line: 9,
                      name: "Farmer carry",
                      group: "A",
                      notes: "12 kg; Superset x 3 sets",
                      sourceName: "Farmer carry",
                      prescription: {
                        sets: 3,
                        seconds: 60
                      }
                    },
                    {
                      line: 10,
                      name: "Reverse Lunge",
                      notes: "25kg",
                      sourceName: "Reverse Lunge",
                      prescription: {
                        reps: 8,
                        sets: 3
                      }
                    },
                    {
                      line: 11,
                      name: "Bench press",
                      notes: "22.5 kg",
                      sourceName: "Bench press",
                      prescription: {
                        reps: 10,
                        sets: 4
                      }
                    }
                  ]
                }
              ]
            },
            {
              line: 12,
              label: "Day 2 Pull",
              sessions: [
                {
                  kind: "exercises",
                  line: 12,
                  name: "Pull",
                  exercises: [
                    {
                      line: 13,
                      name: "Power snatch",
                      sourceName: "Power snatch",
                      prescription: null
                    },
                    {
                      line: 14,
                      name: "Sled Pull",
                      sourceName: "Sled Pull",
                      prescription: null
                    },
                    {
                      line: 15,
                      name: "Deadlift",
                      sourceName: "Deadlift",
                      prescription: null
                    },
                    {
                      line: 16,
                      name: "V bar row",
                      sourceName: "V bar row",
                      prescription: null
                    },
                    {
                      line: 17,
                      name: "Lat pull down",
                      sourceName: "Lat pull down",
                      prescription: null
                    },
                    {
                      line: 18,
                      name: "Face pull",
                      sourceName: "Face pull",
                      prescription: null
                    }
                  ]
                }
              ]
            }
          ],
          line: 3,
          label: "Week 1 (คี่)"
        }
      ],
      skipped: [
        {
          line: 7,
          reason: "group header"
        }
      ],
      newTerms: []
    }),
  },
  // llm_calls 3791e9a6…, lines 19–41
  {
    from: 19,
    to: 41,
    data: ImportChunk.parse({
      weeks: [
        {
          days: [
            {
              line: 20,
              label: "Day 1 squat+vertical",
              sessions: [
                {
                  kind: "exercises",
                  line: 20,
                  name: "squat+vertical",
                  exercises: [
                    {
                      line: 22,
                      name: "Wallball",
                      group: "A",
                      notes: "Superset x 3 sets",
                      sourceName: "Wallball",
                      prescription: null
                    },
                    {
                      line: 23,
                      name: "Plank shoulder tap",
                      group: "A",
                      notes: "Superset x 3 sets",
                      sourceName: "Plank shoulder tap",
                      prescription: null
                    },
                    {
                      line: 25,
                      name: "Sling Walk",
                      group: "B",
                      notes: "Superset x 3 sets",
                      sourceName: "Sling Walk",
                      prescription: null
                    },
                    {
                      line: 26,
                      name: "SkiERG",
                      group: "B",
                      notes: "Superset x 3 sets",
                      sourceName: "SkiERG",
                      prescription: null
                    },
                    {
                      line: 27,
                      name: "Squat",
                      sourceName: "Squat",
                      prescription: null
                    },
                    {
                      line: 29,
                      name: "Shoulder press",
                      group: "C",
                      notes: "Superset x 3 sets",
                      sourceName: "Shoulder press",
                      prescription: null
                    },
                    {
                      line: 30,
                      name: "Lat pull down",
                      group: "C",
                      notes: "Superset x 3 sets",
                      sourceName: "Lat pull down",
                      prescription: null
                    }
                  ]
                }
              ]
            },
            {
              line: 31,
              label: "Day 2 Deadlift + Horizontal",
              sessions: [
                {
                  kind: "exercises",
                  line: 31,
                  name: "Deadlift + Horizontal",
                  exercises: [
                    {
                      line: 33,
                      name: "Single leg throwball",
                      group: "A",
                      notes: "Superset x 3 sets",
                      sourceName: "Single leg throwball",
                      prescription: null
                    },
                    {
                      line: 34,
                      name: "Slamball side to side",
                      group: "A",
                      notes: "Superset x 3 sets",
                      sourceName: "Slamball side to side",
                      prescription: null
                    },
                    {
                      line: 36,
                      name: "RowERG",
                      group: "B",
                      notes: "Superset x 3 sets",
                      sourceName: "RowERG",
                      prescription: null
                    },
                    {
                      line: 37,
                      name: "Russian Twist",
                      group: "B",
                      notes: "Superset x 3 sets",
                      sourceName: "Russain Twist",
                      prescription: null
                    },
                    {
                      line: 38,
                      name: "Deadlift",
                      sourceName: "Deadlift",
                      prescription: null
                    },
                    {
                      line: 40,
                      name: "Bench press",
                      group: "C",
                      notes: "Supersets x 3sets",
                      sourceName: "Bench press",
                      prescription: null
                    },
                    {
                      line: 41,
                      name: "Bent over row",
                      group: "C",
                      notes: "Supersets x 3sets",
                      sourceName: "Bent over row",
                      prescription: null
                    }
                  ]
                }
              ]
            }
          ],
          line: 19,
          label: "Week 2 (คู่)"
        }
      ],
      skipped: [
        {
          line: 21,
          reason: "group header"
        },
        {
          line: 24,
          reason: "group header"
        },
        {
          line: 28,
          reason: "group header"
        },
        {
          line: 32,
          reason: "group header"
        },
        {
          line: 35,
          reason: "group header"
        },
        {
          line: 39,
          reason: "group header"
        }
      ],
      newTerms: []
    }),
  },
];
