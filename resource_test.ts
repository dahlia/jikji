import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {
  Content,
  ContentKey,
  ContentKeyError,
  Resource,
  ResourceError,
} from "./resource.ts";
import { assertEquals$ } from "./asserts.ts";

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

Deno.test("Resource.lastModified", () => {
  assertEquals(new Date(0), fixture.lastModified);
  const d = new Date(Date.UTC(2021, 0, 1, 1, 1, 1));
  const c = new Content("", "text/plain", null, d);
  const r = new Resource("file:///tmp/site/bar.txt", [...fixture, c]);
  assertEquals(r.lastModified, d);
});

Deno.test("Resource.size", () => {
  assertEquals(4, fixture.size);
  const contents = [...fixture];
  for (let i = 1; i < fixture.size; i++) {
    const r = new Resource("file:///tmp/site/bar.txt", contents.slice(0, i));
    assertEquals(i, r.size);
  }
});

Deno.test("Resource.hasRepresentation()", () => {
  assert(
    fixture.hasRepresentation(ContentKey.get("text/plain; charset=utf8", "en")),
  );
  assert(
    fixture.hasRepresentation(ContentKey.get("text/html; charset=utf8", "en")),
  );
  assert(
    fixture.hasRepresentation(ContentKey.get("text/plain; charset=utf8", "ko")),
  );
  assert(
    fixture.hasRepresentation(ContentKey.get("text/html; charset=utf8", "ko")),
  );
  assert(!fixture.hasRepresentation(ContentKey.get("text/plain", "en")));
  assert(!fixture.hasRepresentation(ContentKey.get("text/html", "en")));
  assert(!fixture.hasRepresentation(ContentKey.get("text/plain", "ko")));
  assert(!fixture.hasRepresentation(ContentKey.get("text/html", "ko")));
});

Deno.test("Resource.getRepresentation()", async () => {
  await assertEquals$(
    fixture.getRepresentation(ContentKey.get("text/plain; charset=utf8", "en")),
    new Content("Foo", "text/plain; charset=utf8", "en", new Date(0)),
  );
  await assertEquals$(
    fixture.getRepresentation(ContentKey.get("text/html; charset=utf8", "en")),
    new Content("<h1>foo</h1>", "text/html; charset=utf8", "en", new Date(0)),
  );
  await assertEquals$(
    fixture.getRepresentation(ContentKey.get("text/plain; charset=utf8", "ko")),
    new Content("푸", "text/plain; charset=utf8", "ko", new Date(0)),
  );
  await assertEquals$(
    fixture.getRepresentation(ContentKey.get("text/html; charset=utf8", "ko")),
    new Content("<h1>푸</h1>", "text/html; charset=utf8", "ko", new Date(0)),
  );
  assertStrictEquals(
    fixture.getRepresentation(ContentKey.get("text/plain", "en")),
    null,
  );
  assertStrictEquals(
    fixture.getRepresentation(ContentKey.get("text/html", "en")),
    null,
  );
  assertStrictEquals(
    fixture.getRepresentation(ContentKey.get("text/plain", "ko")),
    null,
  );
  assertStrictEquals(
    fixture.getRepresentation(ContentKey.get("text/html", "ko")),
    null,
  );
});

Deno.test("Resource.addRepresentation()", async () => {
  const c = new Content("甲", "text/plain; charset=utf-8", "zh", new Date(1));
  const r = fixture.addRepresentation(c);
  await assertEquals$(r, new Resource(r.path, [...fixture, c]));

  assertThrows(() => r.addRepresentation(c), ContentKeyError);
});

Deno.test("ResourceError()", () => {
  const e = new ResourceError();
  assertEquals(e.message, "");
  assertEquals(e.name, "ResourceError");
  const e2 = new ResourceError("error message");
  assertEquals(e2.message, "error message");
  assertEquals(e2.name, "ResourceError");
});
