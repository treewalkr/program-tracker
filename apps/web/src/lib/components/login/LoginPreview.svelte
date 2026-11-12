<script lang="ts">
  import type { LoginTheme } from "@pt/shared";
  import { PREVIEW_DEVICES, previewScale, type PreviewDevice } from "$lib/loginTheme";
  import LoginView from "./LoginView.svelte";

  /**
   * The real login layout, rendered at a full desktop or phone screen and
   * scaled down to fit. Inert: a picture of the page, not a second sign-in.
   */
  interface Props {
    theme: LoginTheme;
    device: PreviewDevice;
  }

  let { theme, device }: Props = $props();

  let available = $state(0);
  const screen = $derived(PREVIEW_DEVICES[device]);
  const scale = $derived(previewScale(available, screen));
</script>

<div class="stage" bind:clientWidth={available}>
  <div
    class={["frame", device]}
    style:width="{screen.width * scale}px"
    style:height="{screen.height * scale}px"
    role="img"
    aria-label="Preview of the {theme.variant} login page, {screen.label.toLowerCase()} size"
  >
    <div
      class="screen"
      inert
      style:width="{screen.width}px"
      style:height="{screen.height}px"
      style:transform="scale({scale})"
      style:--login-min-h="{screen.height}px"
    >
      <LoginView {theme} href="/login" error={null} />
    </div>
  </div>
</div>

<style>
  .stage {
    display: flex;
    justify-content: center;
    min-width: 0;
  }
  .frame {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--line);
    background: var(--bg);
    flex: none;
  }
  .frame.phone {
    border-radius: 8px;
  }
  .screen {
    transform-origin: top left;
    overflow: hidden;
    user-select: none;
  }
</style>
