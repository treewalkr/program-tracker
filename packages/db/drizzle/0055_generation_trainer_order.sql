-- True once the trainer has hand-edited a draft's exercise order: the order is kept as stored (no role sort) on screen, in later versions and through approve. Defaults false, so the previous API keeps working during the deploy.
ALTER TABLE "ai_generations" ADD COLUMN "trainer_order" boolean DEFAULT false NOT NULL;
