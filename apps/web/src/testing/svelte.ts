import { plugin } from "bun";
import { compile } from "svelte/compiler";

/**
 * Test preload: lets `bun test` import .svelte files, compiled for the server,
 * so component tests can `render()` them from `svelte/server` and assert on
 * the HTML. Components that read `$app/*` can't load here — keep those thin.
 */
plugin({
  name: "svelte-ssr",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const { js } = compile(source, { filename: path, generate: "server", runes: true });
      return { contents: js.code, loader: "js" };
    });
  },
});
