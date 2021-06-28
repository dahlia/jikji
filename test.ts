import { walk } from "https://deno.land/std@0.99.0/fs/walk.ts";
import { join, sep } from "https://deno.land/std@0.99.0/path/mod.ts";
import { assertEquals } from "https://deno.land/std@0.99.0/testing/asserts.ts";
import { intoDirectory, rebase, scanFiles, writeFiles } from "./file.ts";
import { withFixture } from "./fixtures.ts";
import { frontMatter, markdown } from "./markdown.ts";

Deno.test("sample", () =>
  withFixture(
    {
      "src/posts/2020/01/foo.md": "# foo",
      "src/posts/2020/01/bar.md": "# bar",
      "src/posts/2020/07/baz.md": "# baz",
      "src/posts/2021/02/qux.md": "# qux",
      "src/posts/2021/02/should-be-excluded.txt": "quux",
      "should/be/excluded.md": "quuz",
    },
    async (tempDir: string) => {
      const srcDir = join(tempDir, "src");
      const baseUrl = new URL("https://example.com/blog/");
      const outDir = join(tempDir, "public_html");
      await scanFiles(join(srcDir, "posts", "**", "*.md"))
        .move(rebase(srcDir + sep, baseUrl))
        .move(intoDirectory())
        .transform(frontMatter, { type: "text/markdown" })
        .transform(markdown(), { type: "text/markdown" })
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
        "<h1>foo</h1>",
      );
      assertEquals(
        decode(await Deno.readFile(join(outDir, barPath))),
        "<h1>bar</h1>",
      );
      assertEquals(
        decode(await Deno.readFile(join(outDir, bazPath))),
        "<h1>baz</h1>",
      );
      assertEquals(
        decode(await Deno.readFile(join(outDir, quxPath))),
        "<h1>qux</h1>",
      );
    },
  ));
