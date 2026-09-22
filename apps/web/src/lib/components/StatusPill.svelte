<script lang="ts">
  let { status }: { status: string } = $props();

  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: "good", label: "active" },
    paused: { cls: "warn", label: "paused" },
    archived: { cls: "neutral", label: "archived" },
    draft: { cls: "neutral", label: "draft" },
    validated: { cls: "good", label: "validated" },
    approved: { cls: "good", label: "approved" },
    rejected: { cls: "bad", label: "rejected" },
    failed_validation: { cls: "bad", label: "failed validation" },
    failed_provider: { cls: "bad", label: "provider error" },
  };
  const view = $derived(map[status] ?? { cls: "neutral", label: status });
</script>

<span class="pill {view.cls}">{view.label}</span>
