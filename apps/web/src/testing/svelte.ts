import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";

/**
 * Test preload: lets `bun test` import .svelte files, compiled for the server,
 * so component tests can `render()` them from `svelte/server` and assert on
 * the HTML, and .svelte.ts modules so their rune logic can run. Anything that
 * reads `$app/*` needs a `mock.module` for it — keep those thin.
 */
plugin({
  name: "svelte-ssr",
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const { js } = compile(source, { filename: path, generate: "server", runes: true });
      return { contents: js.code, loader: "js" };
    });
    const ts = new Bun.Transpiler({ loader: "ts" });
    build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
      const source = ts.transformSync(await Bun.file(path).text());
      const { js } = compileModule(source, { filename: path, generate: "server" });
      return { contents: js.code, loader: "js" };
    });
  },
});
