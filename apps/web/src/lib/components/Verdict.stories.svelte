<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Verdict from './Verdict.svelte';

  const { Story } = defineMeta({
    title: 'Domain/Verdict',
    component: Verdict,
    tags: ['autodocs'],
  });
</script>

<Story name="Unrated" args={{ subjectKind: 'chat_message', subjectId: 'story-unrated', initial: null }} />

<Story
  name="Thumbs down with reasons"
  args={{
    subjectKind: 'generation',
    subjectId: 'story-down',
    noun: 'draft',
    initial: {
      id: 'v1',
      subjectKind: 'generation',
      subjectId: 'story-down',
      signal: 'thumbs_down',
      reasonTags: ['ignored_limitation', 'volume_off'],
      comment: 'Knee — no deep squats this block',
      createdAt: '2026-11-07T10:00:00.000Z',
    },
  }}
/>

<Story
  name="Thumbs up"
  args={{
    subjectKind: 'client_message',
    subjectId: 'story-up',
    noun: 'draft message',
    initial: {
      id: 'v2',
      subjectKind: 'client_message',
      subjectId: 'story-up',
      signal: 'thumbs_up',
      reasonTags: [],
      comment: null,
      createdAt: '2026-11-07T10:00:00.000Z',
    },
  }}
/>
