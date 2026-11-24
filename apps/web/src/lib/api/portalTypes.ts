import type { DisplayUnits, PortalProgressDto, PortalWeekDto, Vo2Protocol } from "@pt/shared";
import type { CardioLogDto, LogSetInput, ReadinessDto, SessionFlagDto } from "./types";

/** Client portal API types — no SvelteKit imports, so the mock and unit tests load them directly. */

export interface PortalMeDto {
  client: { id: string; name: string };
  trainer: { name: string };
}

export type PortalSession = { kind: "signedIn"; me: PortalMeDto } | { kind: "signedOut" };

/** Whose access link this is. */
export interface PortalLinkInfo {
  clientFirstName: string;
  trainerName: string;
  /** This browser is already signed in as this client: skip "Open my program". */
  signedIn: boolean;
}

/** A portal log: the trainer's log shape minus who and which program — the session says. */
export interface PortalLogInput {
  programSessionId: string;
  date: string;
  kind?: "exercises" | "cardio";
  cardio?: CardioLogDto | null;
  notes?: string;
  perceivedEnergy?: number;
  readiness?: ReadinessDto | null;
  flags?: SessionFlagDto[] | null;
  /** Movement-prep items ticked (program-exercise ids). */
  prepDone?: string[];
  /** Already logged by the client: 409 (reject) or swap it (replace). */
  onDuplicate?: "reject" | "replace";
  sets: LogSetInput[];
  /** Minutes from the first entry to Save, for a session logged live. */
  durationMin?: number;
  /** The phone's local date (YYYY-MM-DD); the API seam fills it in. */
  today?: string;
}

export interface PortalSavedLog {
  id: string;
  programSessionId: string | null;
  date: string;
  loggedBy: "trainer" | "client";
}

/** 409 from a portal save: the session is already logged — by the client (replaceable) or the coach (not). */
export class PortalDuplicateError extends Error {
  readonly status = 409;
  constructor(readonly existing: { id: string; date: string; loggedBy: "trainer" | "client" }) {
    super("already logged");
    this.name = "PortalDuplicateError";
  }
}

export interface PortalApi {
  session(): Promise<PortalSession>;
  week(): Promise<PortalWeekDto>;
  /** The Progress tab; `protocol` picks which field test's VO₂max trend (default: the newest test's). */
  progress(protocol?: Vo2Protocol | null): Promise<PortalProgressDto>;
  /** `signal` aborts a save that hangs (the page gives up after a timeout and keeps the draft). */
  log(input: PortalLogInput, opts?: { signal?: AbortSignal }): Promise<PortalSavedLog>;
  /** The member's own settings: display units (the language lives in the URL). */
  settings(): Promise<{ units: DisplayUnits }>;
  saveSettings(units: DisplayUnits): Promise<{ units: DisplayUnits }>;
  /** Undo: delete one of the client's own logs. */
  deleteLog(id: string): Promise<void>;
  /** Null when the link is unknown, reset, or the portal is off. */
  linkInfo(token: string): Promise<PortalLinkInfo | null>;
  /** Sign in with an access link (sets the client cookie). */
  openLink(token: string): Promise<void>;
  signOut(): Promise<void>;
  /** Google sign-in for clients — a full-page navigation, not a call — coming back to `returnTo`. */
  googleHref(returnTo: string): string;
}

/** Where a signed-out client goes. */
export const PORTAL_LOGIN = "/me/login";

/** Pages a signed-out client may still see. */
export const isPortalPublic = (path: string) => path === PORTAL_LOGIN || path.startsWith("/me/link/");

