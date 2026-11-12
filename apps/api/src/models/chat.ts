/** Chat — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { chatMessages } from "@pt/db/schema";
import { createInsertSchema, createUpdateSchema, spread } from "../utility";
import { str, as, ProviderChoice } from "./shared";

const ChatMessageInsert = createInsertSchema(chatMessages, { content: str({ minLength: 1, maxLength: 2000 }) });
const ChatMessageUpdate = createUpdateSchema(chatMessages);

export const ChatModel = {
  /** The trainer's message (stored as `content`) and the model that answers it. */
  ask: t.Object({
    ...spread(t.Pick(ChatMessageInsert, ["clientId"])),
    message: ChatMessageInsert.properties.content,
    ...ProviderChoice,
  }),
  turn: t.Object({
    ...spread(t.Pick(ChatMessageInsert, ["clientId"])),
    ...spread(t.Pick(ChatMessageUpdate, ["generationId"])),
    message: ChatMessageInsert.properties.content,
    ...ProviderChoice,
  }),
  retry: t.Object(ProviderChoice),
};
