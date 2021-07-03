import { join, sep } from "https://deno.land/std@0.99.0/path/mod.ts";
import { assertEquals } from "https://deno.land/std@0.97.0/testing/asserts.ts";
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
      const expected = Array.from(makeResources(files, lastModified))
        .map(move(rebase("/tmp/site/", path + sep)))
        .sort(comparePath);
      await assertEquals$(rs, expected);
    },
  );
});

Deno.test("writeFiles()", async () => {
  const r = new Resource("file:///tmp/site/foo/bar/", [
    new Content("HTML content", "text/html"),
    new Content("Plain text content", "text/plain"),
  ]);
  await withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(tempDir: string) {
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"));
      await write(r);
      const h = await Deno.readFile(join(tempDir, "foo", "bar", "index.html"));
      assertEquals(h, new TextEncoder().encode("HTML content"));
      const t = await Deno.readFile(join(tempDir, "foo", "bar", "index.txt"));
      assertEquals(t, new TextEncoder().encode("Plain text content"));
    },
  });
  await withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(tempDir: string) {
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"));
      const r2 = r.move("file:///tmp/site/foo/bar");
      await write(r2);
      const h = await Deno.readFile(join(tempDir, "foo", "bar.html"));
      assertEquals(h, new TextEncoder().encode("HTML content"));
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
      const h = await Deno.readFile(join(tempDir, "foo", "bar.htm"));
      assertEquals(h, new TextEncoder().encode("HTML content"));
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
