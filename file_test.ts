/**
 * @copyright 2021 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  join,
  resolve,
  sep,
  toFileUrl,
} from "https://deno.land/std@0.103.0/path/mod.ts";
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.103.0/testing/asserts.ts";
import { sleep } from "https://deno.land/x/sleep@v1.2.0/sleep.ts";
import { assertEquals$ } from "./asserts.ts";
import {
  extendMime,
  Mime,
  rebase,
  relativePathToFileUrl,
  scanFiles,
  writeFiles,
} from "./file.ts";
import { makeResources, withFixture, withTempDir } from "./fixtures.ts";
import { Content, move, replace, Resource } from "./pipeline.ts";

Deno.test({
  name: "rebase() [non-Windows]",
  ignore: Deno.build.os === "windows",
  fn() {
    const r = rebase(
      new URL("file:///tmp/foo/"),
      new URL("http://example.com/"),
    );
    const r2 = rebase("/tmp/foo/", "/home/me/");
    assertEquals(
      r(new URL("file:///tmp/foo/index.html")),
      new URL("http://example.com/index.html"),
    );
    assertEquals(
      r2(new URL("file:///tmp/foo/index.html")),
      new URL("file:///home/me/index.html"),
    );
    assertEquals(
      r(new URL("file:///tmp/foo/bar/index.html")),
      new URL("http://example.com/bar/index.html"),
    );
    assertEquals(
      r2(new URL("file:///tmp/foo/bar/index.html")),
      new URL("file:///home/me/bar/index.html"),
    );

    const r3 = rebase("foo/bar/", "baz/qux/");
    assertEquals(
      r3(toFileUrl(resolve("foo/bar/abc.txt"))),
      toFileUrl(resolve("baz/qux/abc.txt")),
    );

    // If the input is not on the base it returns the input without change.
    assertEquals(
      r(new URL("file:///tmp/bar/index.html")),
      new URL("file:///tmp/bar/index.html"),
    );
    assertEquals(
      r2(new URL("file:///tmp/bar/index.html")),
      new URL("file:///tmp/bar/index.html"),
    );

    // Throws TypeError if base URL does not end with a slash.
    assertThrows(
      () => rebase(new URL("file:///tmp/foo"), new URL("https://example.com/")),
      TypeError,
      "must end with a slash",
    );
    assertThrows(
      () => rebase("./foo", new URL("https://example.com/")),
      TypeError,
      "must end with a slash",
    );

    // Throws TypeError if rebase URL does not end with a slash.
    assertThrows(
      () =>
        rebase(new URL("file:///tmp/foo/"), new URL("https://example.com/x")),
      TypeError,
      "must end with a slash",
    );
    assertThrows(
      () => rebase(new URL("file:///tmp/foo/"), "./foo"),
      TypeError,
      "must end with a slash",
    );
  },
});

Deno.test({
  name: "rebase() [Windows]",
  ignore: Deno.build.os !== "windows",
  fn() {
    const r = rebase(
      new URL("file:///C:/temp/foo/"),
      new URL("http://example.com/"),
    );
    const r2 = rebase("C:\\temp\\foo\\", "C:\\Users\\me\\");
    assertEquals(
      r(new URL("file:///C:/temp/foo/index.html")),
      new URL("http://example.com/index.html"),
    );
    assertEquals(
      r2(new URL("file:///C:/temp/foo/index.html")),
      new URL("file:///C:/Users/me/index.html"),
    );
    assertEquals(
      r(new URL("file:///C:/temp/foo/bar/index.html")),
      new URL("http://example.com/bar/index.html"),
    );
    assertEquals(
      r2(new URL("file:///C:/temp/foo/bar/index.html")),
      new URL("file:///C:/Users/me/bar/index.html"),
    );

    const r3 = rebase("foo\\bar\\", "baz\\qux\\");
    assertEquals(
      r3(toFileUrl(resolve("foo\\bar\\abc.txt"))),
      toFileUrl(resolve("baz\\qux\\abc.txt")),
    );

    // If the input is not on the base it returns the input without change.
    assertEquals(
      r(new URL("file:///C:/temp/bar/index.html")),
      new URL("file:///C:/temp/bar/index.html"),
    );
    assertEquals(
      r2(new URL("file:///C:/temp/bar/index.html")),
      new URL("file:///C:/temp/bar/index.html"),
    );

    // Throws TypeError if base URL does not end with a slash.
    assertThrows(
      () =>
        rebase(
          new URL("file:///C:/temp/foo"),
          new URL("https://example.com/"),
        ),
      TypeError,
      "must end with a slash",
    );
    assertThrows(
      () => rebase(".\\foo", new URL("https://example.com/")),
      TypeError,
      "must end with a slash",
    );

    // Throws TypeError if rebase URL does not end with a slash.
    assertThrows(
      () =>
        rebase(
          new URL("file:///C:/temp/foo/"),
          new URL("https://example.com/x"),
        ),
      TypeError,
      "must end with a slash",
    );
    assertThrows(
      () => rebase(new URL("file:///C:/temp/foo/"), ".\\foo"),
      TypeError,
      "must end with a slash",
    );
  },
});

Deno.test("relativePathToFileUrl()", () => {
  assertEquals(
    relativePathToFileUrl(join("foo", "bar")),
    toFileUrl(resolve(join("foo", "bar"))),
  );
  assertEquals(
    relativePathToFileUrl("foo" + sep),
    toFileUrl(resolve("foo") + sep),
  );
  if (Deno.build.os === "windows") {
    assertEquals(
      relativePathToFileUrl("C:\\foo\\bar"),
      new URL("file:///C:/foo/bar"),
    );
    assertEquals(
      relativePathToFileUrl("C:\\foo\\bar\\"),
      new URL("file:///C:/foo/bar/"),
    );
  } else {
    assertEquals(
      relativePathToFileUrl("/foo/bar"),
      new URL("file:///foo/bar"),
    );
    assertEquals(
      relativePathToFileUrl("/foo/bar/"),
      new URL("file:///foo/bar/"),
    );
  }
  assertEquals(
    relativePathToFileUrl(new URL("https://example/com/")),
    new URL("https://example/com/"),
  );
});

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
      const options = {};
      let writeLog: { path: string; content: unknown; target: unknown }[] = [];
      (options as { onWrite: unknown }).onWrite = (
        path: URL,
        content: unknown,
        target: unknown,
      ) => writeLog.push({ path: path.href, content, target });
      const write = writeFiles(tempDir, new URL("file:///tmp/site/"), options);
      if (Deno.build.os === "linux") await sleep(1);
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
      writeLog = [];
      await write(r);
      assertEquals(writeLog, []);
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
