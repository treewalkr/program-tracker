-- F19/F20 (docs/top10-remaining-plan.md P4): new movement patterns and muscle groups, rebuilt kinetic chain defaults.
-- Data only, idempotent. Every update is guarded by the row's old value, so trainer edits are never overwritten.

-- 1. Library exercises (trainer_id IS NULL): re-tag by name to match packages/db/library (130 rows).
--    planks/rollouts → anti_extension, Nordic → knee_dominant, carries → carry, curls/raises/single-joint → isolation.
UPDATE "exercises" AS e
SET "movement_pattern" = v.new_pattern, "functional_movement" = v.new_functional
FROM (VALUES
  ('Ab Wheel Rollout', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Alternating Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Alternating Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('Alternating Incline Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Band Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Band External Rotation', NULL, NULL, 'isolation', NULL),
  ('Band Hip Adduction', NULL, NULL, 'isolation', NULL),
  ('Band Hip Flexion', NULL, NULL, 'isolation', NULL),
  ('Band Internal Rotation', NULL, NULL, 'isolation', NULL),
  ('Band Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Band Skull Crusher', NULL, NULL, 'isolation', NULL),
  ('Barbell Curl', NULL, NULL, 'isolation', NULL),
  ('Barbell Drag Curl', NULL, NULL, 'isolation', NULL),
  ('Barbell Finger Curl', NULL, NULL, 'isolation', NULL),
  ('Barbell Overhead Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Barbell Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('Barbell Reverse Wrist Curl', NULL, NULL, 'isolation', NULL),
  ('Barbell Seated Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Barbell Wrist Curl', NULL, NULL, 'isolation', NULL),
  ('Behind-the-Body Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Body Saw', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Bodyweight Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Cable External Rotation', NULL, NULL, 'isolation', NULL),
  ('Cable Front Raise', NULL, NULL, 'isolation', NULL),
  ('Cable Hip Adduction', NULL, NULL, 'isolation', NULL),
  ('Cable Incline Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Cable Internal Rotation', NULL, NULL, 'isolation', NULL),
  ('Cable Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Cable Lying Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Cable Overhead Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Cable Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('Cable Rope Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('Cable Seated Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Cable Triceps Kickback', NULL, NULL, 'isolation', NULL),
  ('Cable Wrist Curl', NULL, NULL, 'isolation', NULL),
  ('Close-Grip Barbell Curl', NULL, NULL, 'isolation', NULL),
  ('Close-Grip EZ-Bar Curl', NULL, NULL, 'isolation', NULL),
  ('Concentration Curl', NULL, NULL, 'isolation', NULL),
  ('Cross-Body Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('Dead Bug', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Decline Dumbbell Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Decline EZ-Bar Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Donkey Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Dragon Flag', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Dumbbell External Rotation', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Front Raise', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Preacher Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Pronation', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Reverse Wrist Curl', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Scaption', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Supination', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Triceps Kickback', NULL, NULL, 'isolation', NULL),
  ('Dumbbell Wrist Curl', NULL, NULL, 'isolation', NULL),
  ('EZ-Bar Curl', NULL, NULL, 'isolation', NULL),
  ('EZ-Bar Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('EZ-Bar Skull Crusher', NULL, NULL, 'isolation', NULL),
  ('EZ-Bar Spider Curl', NULL, NULL, 'isolation', NULL),
  ('Farmer''s Carry', NULL, 'locomotion', 'carry', 'locomotion'),
  ('High Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Hollow Body Hold', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Incline Barbell Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Incline Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Incline Hammer Curl', NULL, NULL, 'isolation', NULL),
  ('JM Press', NULL, NULL, 'isolation', NULL),
  ('Kettlebell Overhead Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Kneeling Barbell Rollout', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Kneeling Cable Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Lateral-to-Front Raise', NULL, NULL, 'isolation', NULL),
  ('Leg Press Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Lying Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Lying Dumbbell Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Lying Leg Curl', 'hip_dominant', 'bend_lift', 'isolation', NULL),
  ('Machine Biceps Curl', NULL, NULL, 'isolation', NULL),
  ('Machine Calf Press', NULL, NULL, 'isolation', NULL),
  ('Machine Hip Abduction', NULL, NULL, 'isolation', NULL),
  ('Machine Hip Adduction', NULL, NULL, 'isolation', NULL),
  ('Machine Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Machine Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('Machine Standing Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Machine Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Neck Harness Extension', NULL, NULL, 'isolation', NULL),
  ('Nordic Hamstring Curl', 'hip_dominant', 'bend_lift', 'knee_dominant', NULL),
  ('Overhead Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Overhead Dumbbell Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Plank', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Plate Front Raise', NULL, NULL, 'isolation', NULL),
  ('Plate Pinch', NULL, NULL, 'isolation', NULL),
  ('Prone Incline Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Prone Plate Neck Extension', NULL, NULL, 'isolation', NULL),
  ('Reverse-Grip Barbell Curl', NULL, NULL, 'isolation', NULL),
  ('Reverse-Grip Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Reverse-Grip Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Reverse-Grip Triceps Pushdown', NULL, NULL, 'isolation', NULL),
  ('Rope Triceps Pushdown', NULL, NULL, 'isolation', NULL),
  ('Seated Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Seated Dumbbell Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Seated Dumbbell Curl', NULL, NULL, 'isolation', NULL),
  ('Seated Dumbbell Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Seated Dumbbell Overhead Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Seated Leg Curl', 'hip_dominant', 'bend_lift', 'isolation', NULL),
  ('Side-Lying Lateral Raise', NULL, NULL, 'isolation', NULL),
  ('Single-Arm Cable Curl', NULL, NULL, 'isolation', NULL),
  ('Single-Arm Cable Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Single-Arm Dumbbell Preacher Curl', NULL, NULL, 'isolation', NULL),
  ('Single-Arm Overhead Dumbbell Triceps Extension', NULL, NULL, 'isolation', NULL),
  ('Single-Leg Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Sliding Leg Curl', 'hip_dominant', 'bend_lift', 'isolation', NULL),
  ('Smith Machine Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Stability Ball Leg Curl', 'hip_dominant', 'bend_lift', 'isolation', NULL),
  ('Standing Barbell Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Standing Barbell Rollout', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Standing Concentration Curl', NULL, NULL, 'isolation', NULL),
  ('Standing Dumbbell Calf Raise', NULL, NULL, 'isolation', NULL),
  ('Standing Leg Curl', 'hip_dominant', 'bend_lift', 'isolation', NULL),
  ('Stir the Pot', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Suitcase Carry', 'anti_lateral_flexion', 'locomotion', 'carry', 'locomotion'),
  ('Supine Plate Neck Flexion', NULL, NULL, 'isolation', NULL),
  ('Suspension Trainer Fallout', 'anti_trunk_flexion', NULL, 'anti_extension', NULL),
  ('Tate Press', NULL, NULL, 'isolation', NULL),
  ('Triceps Pushdown', NULL, NULL, 'isolation', NULL),
  ('V-Bar Triceps Pushdown', NULL, NULL, 'isolation', NULL),
  ('Wide-Grip Barbell Curl', NULL, NULL, 'isolation', NULL),
  ('Wrist Roller', NULL, NULL, 'isolation', NULL),
  ('Yoke Carry', NULL, 'locomotion', 'carry', 'locomotion'),
  ('Zottman Curl', NULL, NULL, 'isolation', NULL)
) AS v(name, old_pattern, old_functional, new_pattern, new_functional)
WHERE e."trainer_id" IS NULL
  AND lower(e."name") = lower(v.name)
  AND e."movement_pattern" IS NOT DISTINCT FROM v.old_pattern
  AND e."functional_movement" IS NOT DISTINCT FROM v.old_functional;
--> statement-breakpoint

-- 2. Library exercises: adductors and obliques as muscle groups (45 rows).
UPDATE "exercises" AS e
SET "primary_muscle_group" = v.new_primary, "secondary_muscle_groups" = v.new_secondary
FROM (VALUES
  ('Band Hip Adduction', 'quads', '[]'::jsonb, 'adductors', '[]'::jsonb),
  ('Band Pallof Press', 'core', '[]'::jsonb, 'core', '["obliques"]'::jsonb),
  ('Barbell Box Squat', 'quads', '["calves","glutes","hamstrings","back"]'::jsonb, 'quads', '["adductors","calves","glutes","hamstrings"]'::jsonb),
  ('Barbell Box Squat with Bands', 'quads', '["glutes","calves","hamstrings","back"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Barbell Box Squat with Chains', 'quads', '["glutes","calves","hamstrings","back"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Barbell Side Bend', 'core', '["back"]'::jsonb, 'core', '["obliques","back"]'::jsonb),
  ('Barbell Squat with Bands', 'quads', '["calves","glutes","hamstrings","back"]'::jsonb, 'quads', '["adductors","calves","glutes","hamstrings"]'::jsonb),
  ('Barbell Squat with Chains', 'quads', '["calves","glutes","hamstrings","back"]'::jsonb, 'quads', '["adductors","calves","glutes","hamstrings"]'::jsonb),
  ('Bird Dog', 'core', '["glutes","back"]'::jsonb, 'core', '["obliques","glutes","back"]'::jsonb),
  ('Cable Hip Adduction', 'quads', '[]'::jsonb, 'adductors', '[]'::jsonb),
  ('Cable Lift', 'core', '["shoulders"]'::jsonb, 'core', '["obliques","shoulders"]'::jsonb),
  ('Cable Russian Twist', 'core', '[]'::jsonb, 'core', '["obliques"]'::jsonb),
  ('Cable Woodchop', 'core', '["shoulders"]'::jsonb, 'core', '["obliques","shoulders"]'::jsonb),
  ('Carioca', 'quads', '["core","glutes","calves","hamstrings"]'::jsonb, 'adductors', '["core","glutes","calves","hamstrings"]'::jsonb),
  ('Cone Hops', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Copenhagen Plank', 'core', '["quads"]'::jsonb, 'core', '["obliques","adductors"]'::jsonb),
  ('Depth Jump', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Diagonal Bound', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Double Kettlebell Windmill', 'core', '["glutes","hamstrings","shoulders","triceps"]'::jsonb, 'core', '["obliques","glutes","hamstrings","shoulders"]'::jsonb),
  ('Dumbbell Side Bend', 'core', '[]'::jsonb, 'core', '["obliques"]'::jsonb),
  ('Half-Kneeling Pallof Press', 'core', '[]'::jsonb, 'core', '["obliques"]'::jsonb),
  ('Kettlebell Windmill', 'core', '["glutes","hamstrings","shoulders","triceps"]'::jsonb, 'core', '["obliques","glutes","hamstrings","shoulders"]'::jsonb),
  ('Landmine Rotation', 'core', '["glutes","back","shoulders"]'::jsonb, 'core', '["obliques","glutes","back","shoulders"]'::jsonb),
  ('Lateral Bound', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["adductors","glutes","calves","hamstrings"]'::jsonb),
  ('Lateral Box Jump', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["adductors","glutes","calves","hamstrings"]'::jsonb),
  ('Lateral Box Shuffle', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Lateral Cone Hop', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["adductors","glutes","calves","hamstrings"]'::jsonb),
  ('Machine Hip Adduction', 'quads', '["glutes","hamstrings"]'::jsonb, 'adductors', '["glutes","hamstrings"]'::jsonb),
  ('Medicine Ball Full Twist', 'core', '["shoulders"]'::jsonb, 'core', '["obliques","shoulders"]'::jsonb),
  ('Medicine Ball Rotational Throw', 'core', '["shoulders","glutes"]'::jsonb, 'core', '["obliques","shoulders","glutes"]'::jsonb),
  ('Medicine Ball Scoop Toss', 'core', '["shoulders","glutes","hamstrings"]'::jsonb, 'core', '["obliques","shoulders","glutes","hamstrings"]'::jsonb),
  ('Pallof Press', 'core', '["chest","shoulders","triceps"]'::jsonb, 'core', '["obliques","chest","shoulders","triceps"]'::jsonb),
  ('Pallof Press With Rotation', 'core', '["chest","shoulders","triceps"]'::jsonb, 'core', '["obliques","chest","shoulders","triceps"]'::jsonb),
  ('Plank Shoulder Tap', 'core', '["shoulders"]'::jsonb, 'core', '["obliques","shoulders"]'::jsonb),
  ('Reverse Band Deadlift', 'back', '["glutes","quads","calves","hamstrings"]'::jsonb, 'back', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Russian Twist', 'core', '["back"]'::jsonb, 'core', '["obliques","back"]'::jsonb),
  ('Side Plank', 'core', '["shoulders"]'::jsonb, 'core', '["obliques","shoulders"]'::jsonb),
  ('Single-Leg Hop', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Single-Leg Lateral Hop', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Skipping', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Sledgehammer Swing', 'core', '["calves","forearms","back","shoulders"]'::jsonb, 'core', '["obliques","calves","forearms","back"]'::jsonb),
  ('Suitcase Carry', 'core', '["forearms","traps"]'::jsonb, 'core', '["obliques","forearms","traps"]'::jsonb),
  ('Sumo Deadlift', 'hamstrings', '["quads","forearms","glutes","back"]'::jsonb, 'hamstrings', '["adductors","forearms","glutes","back"]'::jsonb),
  ('Suspension Trainer Split Squat', 'quads', '["glutes","calves","hamstrings"]'::jsonb, 'quads', '["glutes","adductors","calves","hamstrings"]'::jsonb),
  ('Yoke Carry', 'quads', '["core","glutes","calves","hamstrings"]'::jsonb, 'quads', '["core","glutes","adductors","calves"]'::jsonb)
) AS v(name, old_primary, old_secondary, new_primary, new_secondary)
WHERE e."trainer_id" IS NULL
  AND lower(e."name") = lower(v.name)
  AND e."primary_muscle_group" = v.old_primary
  AND e."secondary_muscle_groups" = v.old_secondary;
--> statement-breakpoint

-- 3. Any exercise (custom included) whose name is clearly a plank/rollout family move but is
--    tagged anti_trunk_flexion: the old label said "planks, rollouts", which resist extension.
UPDATE "exercises"
SET "movement_pattern" = 'anti_extension'
WHERE "movement_pattern" = 'anti_trunk_flexion'
  AND "name" ~* '(plank|roll-?out|ab wheel|dead ?bug|hollow|body saw|fallout|dragon flag|stir the pot)'
  AND "name" !~* '(side plank|copenhagen)';
--> statement-breakpoint

-- 4. Kinetic chains still at the old seed defaults (same name, same set of groups) move to the new
--    defaults (KINETIC_CHAIN_DEFAULTS). Customised chains keep their groups and their name.
UPDATE "kinetic_chains" AS k
SET "name" = v.new_name, "muscle_groups" = v.new_groups, "updated_at" = now()
FROM (VALUES
  ('Intrinsic', '["core","back","traps"]'::jsonb, 'Intrinsic', '["core"]'::jsonb),
  ('Lateral', '["core","glutes","quads"]'::jsonb, 'Lateral', '["glutes","adductors","core"]'::jsonb),
  ('Posterior Spiral', '["glutes","back","hamstrings"]'::jsonb, 'Posterior Oblique', '["glutes","back"]'::jsonb),
  ('Anterior Spiral', '["core","quads","chest"]'::jsonb, 'Anterior Oblique', '["obliques","adductors"]'::jsonb)
) AS v(old_name, old_groups, new_name, new_groups)
WHERE k."name" = v.old_name
  AND k."muscle_groups" @> v.old_groups
  AND k."muscle_groups" <@ v.old_groups
  AND NOT EXISTS (
    SELECT 1 FROM "kinetic_chains" AS o
    WHERE o."trainer_id" = k."trainer_id" AND o."name" = v.new_name AND o."id" <> k."id"
  );
