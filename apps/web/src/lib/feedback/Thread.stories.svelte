<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { unpinnedContext, type FeedbackAiMeta, type FeedbackComment, type FeedbackItem } from '@pt/shared';
  import Thread from './Thread.svelte';

  const kai = { id: 't-kai', name: 'Kai Trainer', avatarUrl: null };
  const ana = { id: 't-ana', name: 'Ana Owner', avatarUrl: null };
  const meta = (over: Partial<FeedbackAiMeta> = {}): FeedbackAiMeta => ({
    verdict: 'exists',
    confidence: 'high',
    citations: ['apps/web/src/routes/settings/+page.svelte:220', 'apps/api/src/routes/account.ts:41'],
    basis: '1a2b3c4d',
    model: 'claude',
    runAt: '2026-11-09T10:00:00.000Z',
    ...over,
  });
  const entry = (over: Partial<FeedbackComment>): FeedbackComment => ({
    id: crypto.randomUUID(),
    kind: 'reply',
    author: null,
    authorKind: 'human',
    visibility: 'public',
    aiMeta: null,
    body: null,
    status: null,
    attachments: [],
    createdAt: '2026-11-09T10:00:00.000Z',
    ...over,
  });
  const item = (thread: FeedbackComment[]): FeedbackItem => ({
    id: '00000000-0000-4000-8000-000000000001',
    number: 42,
    author: kai,
    status: 'new',
    comment: 'How do I stop the feedback emails?',
    triageNote: null,
    route: '/settings',
    source: null,
    context: unpinnedContext('/settings', { viewport: { width: 1280, height: 800, dpr: 2 }, userAgent: 'sb', appVersion: '0.1.11+abc1234' }),
    attachments: [],
    reachable: true,
    shippedIn: null,
    thread,
    unread: false,
    muted: false,
    createdAt: '2026-11-09T09:00:00.000Z',
    updatedAt: '2026-11-09T09:00:00.000Z',
  });

  const answer =
    'Open **Settings → Email** and untick *Email me about feedback*.\n\n- Replies only: keep it on, untick **Status changes**\n- One ticket: use **Mute** on it';
  const note =
    'Verdict exists: the master switch is `feedbackEmails` on the Settings page; per-event prefs below it. Verified on origin/main.';

  const { Story } = defineMeta({
    title: 'Feedback/Thread',
    component: Thread,
    parameters: {
      docs: {
        description: {
          component:
            "A ticket's conversation. AI entries: a sent answer carries the AI badge; an unsent draft is a dashed card the admin sends, edits or discards; a private triage note is a quiet well with verdict, confidence, risk, the fix plan and citations. Reply bodies render as safe markdown (raw HTML escaped).",
        },
      },
    },
  });
</script>

<Story
  name="Conversation (markdown)"
  args={{
    item: item([
      entry({ author: ana, body: 'Which screen were you on?' }),
      entry({ author: kai, body: 'The **log** screen — and `<b>this</b>` should show as text.\nSecond line.' }),
      entry({ kind: 'status', author: ana, status: 'accepted' }),
    ]),
  }}
/>

<Story name="AI answer (sent)" args={{ item: item([entry({ authorKind: 'ai', body: answer })]) }} />

<Story
  name="Admin: draft + private note"
  args={{
    item: item([
      entry({ authorKind: 'ai', visibility: 'private', aiMeta: meta({ confidence: 'medium' }), body: note }),
      entry({ authorKind: 'ai', visibility: 'draft', aiMeta: meta({ confidence: 'medium' }), body: answer }),
    ]),
  }}
/>

<Story
  name="Admin: private note only (bug)"
  args={{
    item: item([
      entry({
        authorKind: 'ai',
        visibility: 'private',
        aiMeta: meta({
          verdict: 'bug',
          confidence: 'low',
          citations: ['apps/web/src/lib/feedback/Thread.svelte:88'],
          risk: 'medium',
          fixPlan: [
            'In apps/api/src/lib/feedback.ts, skip muted items when computing unread.',
            'Add a case to apps/api/src/feedback.test.ts for a muted ticket with a new reply.',
          ],
        }),
        body: 'Looks like a real bug: the unread dot ignores muted tickets. Needs a person.',
      }),
    ]),
  }}
/>
