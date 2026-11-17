<script lang="ts">
  import { onMount } from "svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Pill from "$lib/ui/Pill.svelte";

  /* Read-mode page: the contents list on the right follows the section in view. */
  const toc = [
    { id: "what-it-is", label: "What it is" },
    { id: "set-up", label: "Set it up" },
    { id: "client-sees", label: "What your client sees" },
    { id: "client-logs", label: "How your client logs" },
    { id: "you-see", label: "What you see afterwards" },
    { id: "reset-off", label: "Reset or turn off" },
    { id: "stuck", label: "When something doesn't work" },
  ];
  let current = $state(toc[0].id);

  onMount(() => {
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
        const first = toc.find((t) => seen.has(t.id));
        if (first) current = first.id;
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    for (const t of toc) {
      const el = document.getElementById(t.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  });
</script>

<svelte:head><title>Client portal guide · Program Tracker</title></svelte:head>

<PageHead
  title="Client portal"
  sub="Give a client a link to their week. They log sessions on their phone; the logs land in your data."
  crumbs={[{ label: "Guide" }, { label: "Client portal" }]}
/>

<div class="doc">
  <article>
    <section id="what-it-is">
      <h2>What it is</h2>
      <p>
        The portal is a page your client opens on their phone. It shows this week's and next week's sessions from their
        <strong>active program</strong>, and lets them log what they did, set by set. It replaces the "send me your numbers in
        LINE" step: you no longer type their sessions in by hand.
      </p>
      <p>
        You turn it on <strong>per client</strong>. A client you haven't turned it on for has no way in. It never shows the
        parts of the app you work in — only the program.
      </p>
    </section>

    <section id="set-up">
      <h2>Set it up</h2>
      <ol class="steps">
        <li>
          <h3>Open the client's Settings tab</h3>
          <p>
            <span class="path"><code>Clients</code> › <code>their name</code> › <code>Settings</code></span> The
            <strong>Client portal</strong> box is the first one on the page.
          </p>
        </li>
        <li>
          <h3>Check their email first</h3>
          <p>
            If the client has an email on file, they can sign in with the Google account that uses it. The box says
            <em>Uses name@example.com</em>. With no email it says <em>No email on file</em> and they can only use the link. You can
            add one in the client's profile; you can also skip Google entirely.
          </p>
        </li>
        <li>
          <h3>Press <em>Turn on</em></h3>
          <p>
            The box now shows a personal <strong>Access link</strong>. Nothing is sent to the client yet, and an empty program is
            fine: they'll see "Your coach hasn't published a program yet" until you activate one.
          </p>
        </li>
        <li>
          <h3>Send it</h3>
          <p>
            <strong>Copy message</strong> under <em>For LINE</em> gives you a ready sentence plus the link, in English or ไทย
            (switch with EN / ไทย; it starts in the client's language when their name is written in Thai). Paste it into LINE.
            <strong>Copy link</strong> copies only the link.
          </p>
        </li>
        <li>
          <h3>They open it once on their phone</h3>
          <p>
            The page says <em>Open {"{your name}"}'s program for {"{their name}"}</em> with one button. After that they stay signed
            in on that phone, with no password. The box shows <em>Last seen</em> once they've been in.
          </p>
        </li>
      </ol>
      <p class="aside">
        <strong>Try it yourself.</strong> Open the link in the same browser you use for Program Tracker. The portal keeps its own sign-in, so
        you stay signed in here and see exactly what your client sees.
      </p>
    </section>

    <section id="client-sees">
      <h2>What your client sees</h2>
      <p>Only the program you've activated, and only what they need to train.</p>
      <div class="compare">
        <div class="col">
          <h3>They can see</h3>
          <ul>
            <li>This week and next week of the <strong>active</strong> program</li>
            <li>Session names and the weekday each one falls on</li>
            <li>Exercises, with sets, reps, kg, RPE, rest and tempo — %1RM already worked out into kg</li>
            <li>Your exercise and session notes, and cardio prescriptions</li>
            <li>Your name, as their coach</li>
          </ul>
        </div>
        <div class="col never">
          <h3>They never see</h3>
          <ul>
            <li>Drafts, or archived programs</li>
            <li>AI rationale, program direction, phasing</li>
            <li>Limitations, goals, 1RMs</li>
            <li>Signals, your coaching rules, other clients</li>
          </ul>
        </div>
      </div>
      <p>
        Next week is a preview; they can open it but can log it only once that week starts. English and ไทย are one tap in the
        header, and the choice sticks on their phone. Your app stays in English.
      </p>
    </section>

    <section id="client-logs">
      <h2>How your client logs</h2>
      <ol class="steps plain">
        <li>
          <h3>Next up</h3>
          <p>The page opens on today's first open session with a green <strong>Log it</strong> button. Earlier sessions this week they haven't logged sit under <em>Earlier this week</em> as <Pill tone="warn">Not logged</Pill>, never as "missed".</p>
        </li>
        <li>
          <h3>Fill in the sets</h3>
          <p>kg and reps are prefilled from your prescription; they change what differed. RPE is optional behind <em>Log RPE too</em>. An optional "How did you feel today?" strip and a notes field sit at the top and bottom.</p>
        </li>
        <li>
          <h3>Save session</h3>
          <p>One button at the bottom. The recap shows what they logged and how many of the week's sessions are done, with <strong>Undo</strong> if they hit it by mistake.</p>
        </li>
      </ol>
      <p>Rules the portal enforces:</p>
      <ul class="rules">
        <li>They can log <strong>this week only</strong>, for today or earlier.</li>
        <li>They can edit or undo <strong>their own</strong> logs. A session you logged shows <Pill>Logged by your coach</Pill> and can't be replaced from their phone; one they logged shows <Pill tone="good">Logged by you</Pill>.</li>
      </ul>
    </section>

    <section id="you-see">
      <h2>What you see afterwards</h2>
      <p>
        A client's log appears the moment they save, marked <Pill>by client</Pill> in the client's <strong>History</strong>, on the
        program page's logged line, and in the notice on the log page when a session is already logged.
      </p>
      <p>
        It counts like any log you enter: tonnage, sets, average RPE and e1RM in the block pulse, and the
        signals (stall, RPE creep, adherence, cardio behind) all read it. <strong>You're not notified</strong> when a client logs. The
        Overview and the client's page are where it shows up.
      </p>
    </section>

    <section id="reset-off">
      <h2>Reset or turn off</h2>
      <dl class="defs">
        <div>
          <dt>Reset link</dt>
          <dd>
            Use when the link went to the wrong chat or someone else has it. The old link stops working and <strong>every device signed in
            through it is signed out</strong>. Copy the new link and send it. Press once to ask, again to confirm.
          </dd>
        </div>
        <div>
          <dt>Turn off</dt>
          <dd>
            Use when the client stops training with you. The portal closes, sessions end, and the Google link is removed. Their past
            logs stay. Turning it on again later gives a fresh link.
          </dd>
        </div>
      </dl>
    </section>

    <section id="stuck">
      <h2>When something doesn't work</h2>
      <table class="sheet">
        <thead><tr><th scope="col">The client says</th><th scope="col">Why, and what to do</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">"We couldn't find your program for that account"</th>
            <td>The Google account's email isn't the one on the client's profile. Fix the email, or send the link instead.</td>
          </tr>
          <tr>
            <th scope="row">"Google sign-in isn't available yet"</th>
            <td>Google access is still limited for the app. The personal link always works.</td>
          </tr>
          <tr>
            <th scope="row">"Your coach hasn't published a program yet"</th>
            <td>They have no <strong>active</strong> program. Approve and activate the draft; they'll see it right away.</td>
          </tr>
          <tr>
            <th scope="row">The link says it has stopped working</th>
            <td>You reset it, or turned the portal off. Copy the new link from their Settings tab.</td>
          </tr>
          <tr>
            <th scope="row">It's slow on the first open</th>
            <td>Normal for the first visit of the day; it can take up to a minute. They see a "waking the server up" line, not an error.</td>
          </tr>
          <tr>
            <th scope="row">"I logged it but I can't find it"</th>
            <td>Check the client's History for <Pill>by client</Pill>. If <em>Last seen</em> says "Not opened yet", they haven't used the link.</td>
          </tr>
        </tbody>
      </table>
    </section>
  </article>

  <nav class="toc" aria-label="On this page">
    <p class="toc-title">On this page</p>
    <ul>
      {#each toc as t (t.id)}
        <li><a href="#{t.id}" aria-current={current === t.id ? "true" : undefined}>{t.label}</a></li>
      {/each}
    </ul>
  </nav>
</div>

<style>
  .doc {
    display: grid;
    grid-template-columns: minmax(0, 72ch) 200px;
    gap: 48px;
    align-items: start;
  }
  article {
    min-width: 0;
  }
  section {
    padding-top: 28px;
    scroll-margin-top: 12px;
  }
  section:first-child {
    padding-top: 4px;
  }
  h2 {
    margin: 0 0 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line-soft);
    font: 600 18px/1.3 var(--font-ui);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  h3 {
    margin: 0 0 2px;
    font: 600 14px/1.45 var(--font-ui);
  }
  p {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink);
  }
  em {
    font-style: normal;
    font-weight: 500;
  }
  code {
    font: 500 12px/1 var(--font-mono);
    padding: 2px 6px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .path {
    display: inline-block;
    margin-right: 6px;
    color: var(--muted);
  }

  /* Steps: the order matters here, so the sequence earns its numbers. */
  .steps {
    list-style: none;
    counter-reset: step;
    margin: 0 0 12px;
    padding: 0;
  }
  .steps > li {
    counter-increment: step;
    position: relative;
    padding: 0 0 18px 40px;
  }
  .steps > li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 50%;
  }
  /* a hairline carries the eye from one step to the next */
  .steps > li:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 13px;
    top: 30px;
    bottom: 4px;
    width: 1px;
    background: var(--line-soft);
  }
  .steps li p {
    margin: 0;
    color: var(--ink);
  }

  .aside {
    padding: 10px 12px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .compare {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    margin: 0 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .col {
    padding: 12px 16px 6px;
    min-width: 0;
  }
  .col.never {
    background: var(--well);
    border-left: 1px solid var(--line);
  }
  .col ul,
  .rules {
    margin: 6px 0 8px;
    padding-left: 18px;
    display: grid;
    gap: 5px;
    font-size: 14px;
    line-height: 1.55;
  }
  .rules {
    margin-top: 0;
  }

  .defs {
    margin: 0;
    display: grid;
    gap: 14px;
  }
  .defs dt {
    font: 600 14px/1.45 var(--font-ui);
  }
  .defs dd {
    margin: 2px 0 0;
    font-size: 14px;
    line-height: 1.6;
  }

  .sheet {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--line);
    font-size: 13px;
    line-height: 1.55;
  }
  .sheet thead th {
    text-align: left;
    padding: 6px 12px;
    background: var(--well);
    border-bottom: 1px solid var(--line);
    font-weight: 600;
    color: var(--muted);
  }
  .sheet tbody th,
  .sheet td {
    padding: 9px 12px;
    vertical-align: top;
    text-align: left;
    border-top: 1px solid var(--line-soft);
  }
  .sheet tbody th {
    width: 38%;
    font-weight: 500;
  }

  /* Contents: sticky, one hairline, the current section in ink with the orange tab mark. */
  .toc {
    position: sticky;
    top: 16px;
    padding-top: 4px;
  }
  .toc-title {
    margin: 0 0 6px;
    font: 600 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .toc ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-left: 1px solid var(--line-soft);
  }
  .toc a {
    display: block;
    margin-left: -1px;
    padding: 4px 12px;
    border-left: 2px solid transparent;
    font-size: 13px;
    line-height: 1.4;
    color: var(--muted);
    text-decoration: none;
  }
  .toc a:hover {
    color: var(--blue);
  }
  .toc a[aria-current="true"] {
    color: var(--ink);
    font-weight: 600;
    border-left-color: var(--tab-on);
  }

  @media (max-width: 1040px) {
    .doc {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    .toc {
      order: -1;
      position: static;
      margin-bottom: 8px;
    }
    .toc ul {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      border-left: 0;
    }
    .toc a {
      padding: 2px 0;
      margin: 0;
      border-left: 0;
    }
    .toc a[aria-current="true"] {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  }
  @media (max-width: 640px) {
    .compare {
      grid-template-columns: 1fr;
    }
    .col.never {
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .sheet thead {
      display: none;
    }
    .sheet tr {
      display: block;
      border-top: 1px solid var(--line-soft);
    }
    .sheet tbody th,
    .sheet td {
      display: block;
      width: auto;
      border-top: 0;
      padding: 8px 12px 0;
    }
    .sheet td {
      padding-bottom: 10px;
    }
  }
</style>
