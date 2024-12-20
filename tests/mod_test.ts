/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import { walk } from "https://deno.land/std@0.206.0/fs/walk.ts";
import { join, sep } from "https://deno.land/std@0.206.0/path/mod.ts";
import { assertEquals } from "https://deno.land/std@0.206.0/assert/mod.ts";
import { tempDirPermissions, withFixture } from "./fixtures.ts";
import { renderTemplate } from "../ejs.ts";
import { frontMatter, markdown } from "../markdown.ts";
import { intoDirectory, rebase, scanFiles, writeFiles } from "../mod.ts";

Deno.test({
  name: "sample",
  permissions: tempDirPermissions,
  fn: () =>
    withFixture(
      {
        "src/posts/2020/01/foo.md": "---\ntitle: Foo\n---\n# foo",
        "src/posts/2020/01/bar.md": "---\ntitle: Bar\n---\n# bar",
        "src/posts/2020/07/baz.md": "---\ntitle: Baz\n---\n# baz",
        "src/posts/2021/02/qux.md": "---\ntitle: Qux\n---\n# qux",
        "src/posts/2021/02/should-be-excluded.txt": "quux",
        "should/be/excluded.md": "quuz",
      },
      async (fxDir: string, tempDir: string) => {
        const srcDir = join(fxDir, "src");
        const baseUrl = new URL("https://example.com/blog/");
        const outDir = join(fxDir, "public_html");

        const tplPath = join(tempDir, "tpl.ejs");
        await Deno.writeTextFile(
          tplPath,
          "<title><%= metadata.title %></title><article><%- body %></article>",
        );

        await scanFiles(join(srcDir, "posts", "**", "*.md"))
          .move(rebase(srcDir + sep, baseUrl))
          .move(intoDirectory())
          .transform(frontMatter, { type: "text/markdown" })
          .transform(markdown(), { type: "text/markdown" })
          .transform(renderTemplate(tplPath), { type: "text/html" })
          .forEach(writeFiles(outDir, baseUrl));
        const outFiles = [];
        for await (const entry of walk(outDir)) {
          if (entry.isFile && entry.path.startsWith(outDir + sep)) {
            outFiles.push(entry.path.substr(outDir.length + 1));
          }
        }

        const fooPath = join("posts", "2020", "01", "foo", "index.html");
        const barPath = join("posts", "2020", "01", "bar", "index.html");
        const bazPath = join("posts", "2020", "07", "baz", "index.html");
        const quxPath = join("posts", "2021", "02", "qux", "index.html");
        assertEquals(outFiles.sort(), [barPath, fooPath, bazPath, quxPath]);

        const decoder = new TextDecoder();
        const decode = (s: Uint8Array) => decoder.decode(s).trim();
        assertEquals(
          decode(await Deno.readFile(join(outDir, fooPath))),
          "<title>Foo</title><article><h1>foo</h1>\n</article>",
        );
        assertEquals(
          decode(await Deno.readFile(join(outDir, barPath))),
          "<title>Bar</title><article><h1>bar</h1>\n</article>",
        );
        assertEquals(
          decode(await Deno.readFile(join(outDir, bazPath))),
          "<title>Baz</title><article><h1>baz</h1>\n</article>",
        );
        assertEquals(
          decode(await Deno.readFile(join(outDir, quxPath))),
          "<title>Qux</title><article><h1>qux</h1>\n</article>",
        );
      },
    ),
});
