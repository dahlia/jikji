/**
 * @copyright 2021–2023 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { assertEquals$ } from "./asserts.ts";
import {
  Content,
  ContentKey,
  ContentKeyError,
  Resource,
  ResourceError,
} from "../resource.ts";

Deno.test("Resource()", () => {
  const dateA = new Date(0);
  const dateB = new Date(1);
  const txt = new Content("Foo", "text/plain; charset=utf8", "en", dateA);
  const html = new Content(
    "<h1>foo</h1>",
    "text/html; charset=utf8",
    "en",
    dateB,
  );
  const r = new Resource("file:///tmp/site/foo.txt", [txt, html]);
  assertEquals(r.path, new URL("file:///tmp/site/foo.txt"));
  assertEquals(r.lastModified, dateB);
  assertEquals(r.size, 2);
  assertEquals(
    Array.from(r).sort((a, b) => a.lastModified < b.lastModified ? -1 : 1),
    [txt, html],
  );

  // Duplicate content keys:
  assertThrows(
    () =>
      new Resource(
        "file:///tmp/site/foo.txt",
        [txt, new Content("Bar", "text/plain; charset=utf-8", "en")],
      ),
    ContentKeyError,
  );

  // No contents:
  assertThrows(
    () => new Resource("file:///tmp/site/foo.txt", []),
    ResourceError,
  );
});

const fixture = new Resource(
  "file:///tmp/site/foo.txt",
  [
    new Content("Foo", "text/plain; charset=utf8", "en", new Date(0)),
    new Content("<h1>foo</h1>", "text/html; charset=utf8", "en", new Date(0)),
    new Content("푸", "text/plain; charset=utf8", "ko", new Date(0)),
    new Content("<h1>푸</h1>", "text/html; charset=utf8", "ko", new Date(0)),
  ],
);

Deno.test("Resource#lastModified", () => {
  assertEquals(new Date(0), fixture.lastModified);
  const d = new Date(Date.UTC(2021, 0, 1, 1, 1, 1));
  const c = new Content("", "text/plain", null, d);
  const r = new Resource("file:///tmp/site/bar.txt", [...fixture, c]);
  assertEquals(r.lastModified, d);
});

Deno.test("Resource#size", () => {
  assertEquals(4, fixture.size);
  const contents = [...fixture];
  for (let i = 1; i < fixture.size; i++) {
    const r = new Resource("file:///tmp/site/bar.txt", contents.slice(0, i));
    assertEquals(i, r.size);
  }
});

Deno.test("Resource#has()", () => {
  assert(fixture.has(ContentKey.get("text/plain; charset=utf8", "en")));
  assert(fixture.has(ContentKey.get("text/html; charset=utf8", "en")));
  assert(fixture.has(ContentKey.get("text/plain; charset=utf8", "ko")));
  assert(fixture.has(ContentKey.get("text/html; charset=utf8", "ko")));
  assert(!fixture.has(ContentKey.get("text/plain", "en")));
  assert(!fixture.has(ContentKey.get("text/html", "en")));
  assert(!fixture.has(ContentKey.get("text/plain", "ko")));
  assert(!fixture.has(ContentKey.get("text/html", "ko")));
});

Deno.test("Resource#get()", async () => {
  await assertEquals$(
    fixture.get(ContentKey.get("text/plain; charset=utf8", "en")),
    new Content("Foo", "text/plain; charset=utf8", "en", new Date(0)),
  );
  await assertEquals$(
    fixture.get(ContentKey.get("text/html; charset=utf8", "en")),
    new Content("<h1>foo</h1>", "text/html; charset=utf8", "en", new Date(0)),
  );
  await assertEquals$(
    fixture.get(ContentKey.get("text/plain; charset=utf8", "ko")),
    new Content("푸", "text/plain; charset=utf8", "ko", new Date(0)),
  );
  await assertEquals$(
    fixture.get(ContentKey.get("text/html; charset=utf8", "ko")),
    new Content("<h1>푸</h1>", "text/html; charset=utf8", "ko", new Date(0)),
  );
  assertStrictEquals(fixture.get(ContentKey.get("text/plain", "en")), null);
  assertStrictEquals(fixture.get(ContentKey.get("text/html", "en")), null);
  assertStrictEquals(fixture.get(ContentKey.get("text/plain", "ko")), null);
  assertStrictEquals(fixture.get(ContentKey.get("text/html", "ko")), null);
});

Deno.test("Resource#add()", async () => {
  const c = new Content("甲", "text/plain; charset=utf-8", "zh", new Date(1));
  const r = fixture.add(c);
  await assertEquals$(r, new Resource(r.path, [...fixture, c]));

  assertThrows(() => r.add(c), ContentKeyError);
});

Deno.test("Resource#keys()", async () => {
  await assertEquals$(
    fixture.keys(),
    new Set([
      ContentKey.get("text/plain; charset=utf8", "en"),
      ContentKey.get("text/html; charset=utf8", "en"),
      ContentKey.get("text/plain; charset=utf8", "ko"),
      ContentKey.get("text/html; charset=utf8", "ko"),
    ]),
  );
});

Deno.test("Resource#move()", async () => {
  const bar = fixture.move(new URL("file:///tmp/site/bar.txt"));
  assertEquals(bar.path, new URL("file:///tmp/site/bar.txt"));
  await assertEquals$(Array.from(bar), Array.from(fixture));
  const baz = fixture.move("file:///tmp/site/baz.txt");
  assertEquals(baz.path, new URL("file:///tmp/site/baz.txt"));
  await assertEquals$(Array.from(baz), Array.from(fixture));
});

Deno.test("ResourceError()", () => {
  const e = new ResourceError();
  assertEquals(e.message, "");
  assertEquals(e.name, "ResourceError");
  const e2 = new ResourceError("error message");
  assertEquals(e2.message, "error message");
  assertEquals(e2.name, "ResourceError");
});
