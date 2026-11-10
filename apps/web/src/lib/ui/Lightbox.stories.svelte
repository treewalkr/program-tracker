<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Lightbox from "./Lightbox.svelte";

  const { Story } = defineMeta({
    title: "UI/Lightbox",
    component: Lightbox,
    parameters: {
      docs: { description: { component: "Full-screen image viewer on a native modal dialog; steps through a list with arrow keys." } },
    },
  });

  const shot = (fill: string, label: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" font-size="40" text-anchor="middle" fill="#fff">${label}</text></svg>`)}`;
</script>

<Story name="One image" args={{ open: true, images: [{ src: shot("#0969da", "Page"), alt: "Page screenshot", caption: "Page screenshot — the element is outlined in red" }] }} />

<Story
  name="Several images"
  args={{
    open: true,
    images: [
      { src: shot("#0969da", "Page"), alt: "Page screenshot", caption: "Page" },
      { src: shot("#1a7f37", "Element"), alt: "Element screenshot", caption: "Element" },
    ],
  }}
/>
