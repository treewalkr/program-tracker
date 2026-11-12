/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import { spread } from "./utility";
import { TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const AdminModel = {
  invite: t.Pick(TrainerInsert, ["name", "email"]),
  /** `disabled` toggles the server-owned `disabledAt` stamp. */
  editTrainer: t.Object({ ...spread(t.Pick(TrainerUpdate, ["name"])), disabled: t.Optional(t.Boolean()) }),
};
