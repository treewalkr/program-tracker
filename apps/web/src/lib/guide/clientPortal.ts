import { en as portalEn } from "$lib/portal/messages";

/**
 * The client-portal guide. The guide itself is English (so is the trainer's
 * app); only what the *client* reads is bilingual — the phone figures and
 * the LINE message follow the EN / ไทย switch beside them. Anything the
 * client sees is quoted from the portal's own dictionary.
 *
 * Inline markup: **bold**, *italic*, `code`, and ⟦tone|label⟧ for a Pill.
 */
export interface Guide {
  title: string;
  sub: string;
  crumbs: [string, string];
  onThisPage: string;
  intro: string;
  figures: { box: string; phones: string; history: string };
  clientLanguage: string;
  sections: {
    setUp: { h: string; steps: { h: string; p: string }[]; aside: string };
    clientSees: { h: string; lead: string; can: string; canList: string[]; never: string; neverList: string[]; after: string };
    clientLogs: { h: string; steps: { h: string; p: string }[]; rulesLead: string; rules: string[] };
    youSee: { h: string; p: string[] };
    resetOff: { h: string; items: { dt: string; dd: string }[] };
    stuck: { h: string; head: [string, string]; rows: [string, string][] };
  };
}

const q = (k: keyof typeof portalEn) => `"${portalEn[k]}"`;
const first = (s: string, sep: string) => `"${s.split(sep)[0]}"`;

export const guide: Guide = {
  title: "Client portal",
  sub: "Give a client a link to their week. They log sessions on their phone; the logs land in your data.",
  crumbs: ["Guide", "Client portal"],
  onThisPage: "On this page",
  intro:
    "Turn the portal on for a client, copy one message, paste it into LINE. You turn it on **per client**; a client you haven't turned it on for has no way in, and it never shows the parts of the app you work in — only their program.",
  figures: {
    box: "The Client portal box after you press Turn on. Copy message is what you paste into LINE; Last seen fills in once they open it. Sample data.",
    phones:
      "What the client opens: your name, then the next session with its one green button; then the log screen, prefilled from your prescription, where they change only what differed (outlined) and save. Sample session and numbers.",
    history: "Their History tab. The session the client logged carries a by client label; the one you logged does not. Sample rows.",
  },
  clientLanguage: "Show the client's phone in",
  sections: {
    setUp: {
      h: "Set it up",
      steps: [
        { h: "Open the client's Settings tab", p: "`Clients` › `their name` › `Settings`. The **Client portal** box is the first one on the page." },
        {
          h: "Check their email",
          p: "With an email on file they can also sign in with that Google account (the box says `Uses name@example.com`). With none it says *No email on file* and they use the link only. Add one in their profile, or skip Google.",
        },
        {
          h: "Press *Turn on*",
          p: `A personal **Access link** appears. Nothing is sent yet, and no active program is fine: they'll see ${q("week.emptyProgram")} until you activate one.`,
        },
        {
          h: "Send it",
          p: "**Copy message** under *For LINE* copies a ready sentence with the link, in English or ไทย (it starts in Thai when the client's name is written in Thai). Paste it into LINE. **Copy link** copies the link alone.",
        },
        {
          h: "They open it once on their phone",
          p: `The page offers *${portalEn["link.open"]}*. After that they stay signed in on that phone, with no password. *Last seen* fills in.`,
        },
      ],
      aside: "**Try it yourself.** Open the link in the browser you use for Program Tracker. The portal keeps its own sign-in, so you stay signed in here and see exactly what your client sees.",
    },
    clientSees: {
      h: "What your client sees",
      lead: "Only the program you've activated, and only what they need to train.",
      can: "They can see",
      canList: [
        "This week and next week of the **active** program",
        "Session names and the weekday of each",
        "Exercises with sets, reps, kg, RPE, rest and tempo; %1RM is already worked out into kg",
        "Your exercise and session notes, and cardio prescriptions",
        "Your name, as their coach",
      ],
      never: "They never see",
      neverList: ["Drafts or archived programs", "AI rationale, program direction, phasing", "Limitations, goals, 1RMs", "Signals, your coaching rules, other clients"],
      after: "Next week is a preview: they can open it but log it only once that week starts. EN and ไทย are one tap in their header, and the choice stays on their phone.",
    },
    clientLogs: {
      h: "How your client logs",
      steps: [
        {
          h: portalEn["week.nextUp"],
          p: `The page opens on today's first open session with a green **${portalEn["session.log"]}** button. Earlier sessions this week sit under *${portalEn["week.earlier"]}* as ⟦warn|${portalEn["session.notLogged"]}⟧, never as "missed".`,
        },
        {
          h: "Fill in the sets",
          p: `kg and reps come prefilled from your prescription; they change what differed. RPE is optional behind *${portalEn["log.rpeShow"]}*, as is the ${q("log.readiness")} strip.`,
        },
        {
          h: portalEn["log.save"],
          p: `One button at the bottom. The recap shows how many of the week's sessions are done, with **${portalEn["log.undo"]}** for a mistake.`,
        },
      ],
      rulesLead: "Rules the portal enforces:",
      rules: [
        "They can log **this week only**, for today or earlier.",
        `They can edit or undo **their own** logs. A session you logged shows ⟦neutral|${portalEn["session.loggedByCoach"]}⟧ and can't be replaced from their phone; one they logged shows ⟦good|${portalEn["session.loggedByYou"]}⟧.`,
      ],
    },
    youSee: {
      h: "What you see afterwards",
      p: [
        "A client's log appears the moment they save, marked ⟦neutral|by client⟧ in the client's **History**, on the program page's logged line, and in the notice on the log page when a session is already logged.",
        "It counts like any log you enter: the block pulse (tonnage, sets, average RPE, e1RM) and the signals (stall, RPE creep, adherence, cardio behind) all read it. **You're not notified** when a client logs; look on the Overview or the client's page.",
      ],
    },
    resetOff: {
      h: "Reset or turn off",
      items: [
        {
          dt: "Reset link",
          dd: "For a link that went to the wrong chat. The old link stops working and **every device signed in through it is signed out**. Copy the new link and send it. Press once to ask, again to confirm.",
        },
        {
          dt: "Turn off",
          dd: "For a client who stops training with you. The portal closes, sessions end, and the Google link is removed. Past logs stay. Turning it on again gives a fresh link.",
        },
      ],
    },
    stuck: {
      h: "When something doesn't work",
      head: ["The client says", "Why, and what to do"],
      rows: [
        [first(portalEn["login.error.not_allowed"], ". "), "The Google account's email isn't the one on their profile. Fix the email, or send the link instead."],
        [first(portalEn["login.error.not_configured"], ". "), "Google access is still limited for the app. The personal link always works."],
        [q("week.emptyProgram"), "They have no **active** program. Approve and activate the draft; they'll see it right away."],
        [`"${portalEn["link.invalid"]}"`, "You reset it or turned the portal off. Copy the new link from their Settings tab."],
        ["It's slow the first time", `Normal for the first visit of the day; it can take up to a minute. They see ${first(portalEn["week.slow"], " — ")}, not an error.`],
        ["\"I logged it but can't find it\"", "Check their History for ⟦neutral|by client⟧. If *Last seen* says \"Not opened yet\", they haven't used the link."],
      ],
    },
  },
};

/** Section anchors in reading order. */
export const GUIDE_IDS = ["set-up", "client-sees", "client-logs", "you-see", "reset-off", "stuck"] as const;
