import { join, sep } from "https://deno.land/std@0.102.0/path/mod.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.102.0/testing/asserts.ts";
import { assertEquals$ } from "./asserts.ts";
import { extendMime, Mime, scanFiles, writeFiles } from "./file.ts";
import { makeResources, withFixture, withTempDir } from "./fixtures.ts";
import { rebase } from "./path.ts";
import { Content, move, replace, Resource } from "./pipeline.ts";

Deno.test("scanFiles()", () => {
  const files = {
    "posts/2020/01/foo.md": "foo",
    "posts/2020/01/bar.md": "bar",
    "posts/2020/07/baz.md": "baz",
    "posts/2021/02/qux.md": "qux",
  };
  const excludedFiles = {
    "posts/2021/02/should-be-excluded.txt": "quux",
    "should/be/excluded.md": "quuz",
  };
  function comparePath(a: Resource, b: Resource) {
    return a.path.href < b.path.href ? -1 : 1;
  }
  return withFixture(
    { ...files, ...excludedFiles },
    async (path) => {
      const lastModified = new Date();
      const p = scanFiles(join(path, "posts/**/*.md"))
        .transform(replace({ lastModified }));
      const rs: Resource[] = [];
      for await (const r of p) {
        rs.push(r);

        // Eager loading:
        for (const c of r) await c.getBody();
      }
      rs.sort(comparePath);
      const expected = makeResources(files, lastModified)
        .map(move(rebase("/tmp/site/", path + sep)))
        .sort(comparePath);
      await assertEquals$(rs, expected);
    },
  );
});

Deno.test("writeFiles()", async () => {
  const r = new Resource("file:///tmp/site/foo/bar/", [
    new Content("HTML content", "text/html", "en"),
    new Content("HTML 內容", "text/html", "zh"),
    new Content("Plain text content", "text/plain"),
  ]);
  await withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(tempDir: string) {
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"));
      await write(r);
      const enHp = join(tempDir, "foo", "bar", "index.en.html");
      const enHs = await Deno.stat(enHp);
      const enH = await Deno.readFile(enHp);
      assertEquals(enH, new TextEncoder().encode("HTML content"));
      const zhHp = join(tempDir, "foo", "bar", "index.zh.html");
      const zhHs = await Deno.stat(zhHp);
      const zhH = await Deno.readFile(zhHp);
      assertEquals(zhH, new TextEncoder().encode("HTML 內容"));
      const tp = join(tempDir, "foo", "bar", "index.txt");
      const ts = await Deno.stat(tp);
      const t = await Deno.readFile(tp);
      assertEquals(t, new TextEncoder().encode("Plain text content"));

      // If we write again without change, it should be a no-op.
      await write(r);
      const enHs2 = await Deno.stat(enHp);
      const zhHs2 = await Deno.stat(zhHp);
      const ts2 = await Deno.stat(tp);
      assertEquals(enHs2.mtime, enHs.mtime);
      assertEquals(zhHs2.mtime, zhHs.mtime);
      assertEquals(ts2.mtime, ts.mtime);

      // However, if rewriteAlways: true is set, it should rewrite.
      const rewrite = writeFiles(
        tempDir,
        new URL("file:///tmp/site/"),
        { rewriteAlways: true },
      );
      await rewrite(r);
      const enHs3 = await Deno.stat(enHp)!;
      const zhHs3 = await Deno.stat(zhHp)!;
      const ts3 = await Deno.stat(tp);
      assert(enHs3.mtime! > enHs.mtime!);
      assert(zhHs3.mtime! > zhHs.mtime!);
      assert(ts3.mtime! > ts.mtime!);
    },
  });
  await withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(tempDir: string) {
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"));
      const r2 = r.move("file:///tmp/site/foo/bar");
      await write(r2);
      const enH = await Deno.readFile(join(tempDir, "foo", "bar.en.html"));
      assertEquals(enH, new TextEncoder().encode("HTML content"));
      const zhH = await Deno.readFile(join(tempDir, "foo", "bar.zh.html"));
      assertEquals(zhH, new TextEncoder().encode("HTML 內容"));
      const t = await Deno.readFile(join(tempDir, "foo", "bar.txt"));
      assertEquals(t, new TextEncoder().encode("Plain text content"));
    },
  });
  await withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(tempDir: string) {
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"));
      const r3 = r.move("file:///tmp/site/foo/bar.htm");
      await write(r3);
      const enH = await Deno.readFile(join(tempDir, "foo", "bar.en.htm"));
      assertEquals(enH, new TextEncoder().encode("HTML content"));
      const zhH = await Deno.readFile(join(tempDir, "foo", "bar.zh.htm"));
      assertEquals(zhH, new TextEncoder().encode("HTML 內容"));
      const t = await Deno.readFile(join(tempDir, "foo", "bar.txt"));
      assertEquals(t, new TextEncoder().encode("Plain text content"));
    },
  });
});

Deno.test("extendMime()", () => {
  const base = new Mime({
    "text/plain": ["txt"],
    "text/html": ["html", "htm"],
  });
  const extended = extendMime(base);
  base.define({ "image/png": ["png"] });
  extended.define({ "text/markdown": ["md", "markdown"] });
  assertEquals(base.getExtension("text/plain"), "txt");
  assertEquals(extended.getExtension("text/plain"), "txt");
  assertEquals(base.getExtension("text/html"), "html");
  assertEquals(extended.getExtension("text/html"), "html");
  assertEquals(base.getExtension("image/png"), "png");
  assertEquals(extended.getExtension("image/png"), undefined);
  assertEquals(base.getExtension("text/markdown"), undefined);
  assertEquals(extended.getExtension("text/markdown"), "md");
});
