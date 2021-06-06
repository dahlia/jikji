import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {
  Content,
  ContentKey,
  LanguageTag,
  LanguageTagError,
  MediaType,
  MediaTypeError,
} from "./content.ts";

const contentBodyTypes: [string, string | Uint8Array][] = [
  ["Uint8Array", new Uint8Array([])],
  ["string", "content body"],
];

for (const [contentBodyType, contentBodyValue] of contentBodyTypes) {
  Deno.test(`Content(${contentBodyType})`, async () => {
    // all parameters are filled:
    let getterInvoked = false;
    const lastModified = Date.UTC(1988, 8, 4, 1, 2, 3, 4);
    const c = new Content(
      () => {
        getterInvoked = true;
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
      "en-US",
      new Date(lastModified),
      { foo: 123, bar: "baz" },
    );
    assert(!getterInvoked);
    assertStrictEquals(c.type, MediaType.get("text", "plain"));
    assertStrictEquals(c.language, LanguageTag.get("en", null, "US"));
    assertEquals(c.lastModified, new Date(lastModified));
    assertEquals(c.metadata, { foo: 123, bar: "baz" });
    assertStrictEquals(await c.getBody(), contentBodyValue);

    // Content.metadata should be immutable:
    assertThrows(() => c.metadata.baz = 456, TypeError);

    // optional fields are omitted:
    getterInvoked = false;
    const before = new Date();
    const c2 = new Content(
      () => {
        getterInvoked = true;
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
    );
    const after = new Date();
    assert(!getterInvoked);
    assertStrictEquals(c2.type, MediaType.get("text", "plain"));
    assertStrictEquals(c2.language, null);
    assert(before <= c2.lastModified);
    assert(c2.lastModified <= after);
    assertEquals(c2.metadata, {});
    assertStrictEquals(await c2.getBody(), contentBodyValue);

    // non-lazy body:
    const c3 = new Content(contentBodyValue, "text/plain");
    assertStrictEquals(c3.type, MediaType.get("text", "plain"));
    assertStrictEquals(c3.language, null);
    assertStrictEquals(await c2.getBody(), contentBodyValue);

    // invalid arguments:
    assertThrows(
      () => new Content(() => Promise.resolve(""), "invalid-mime"),
      MediaTypeError,
    );
    assertThrows(
      () =>
        new Content(
          () => Promise.resolve(""),
          "text/plain",
          "invalid-lang-tag",
        ),
      LanguageTagError,
    );
  });

  Deno.test(`Content.getBody(): ${contentBodyType}`, async () => {
    const getterInvoked: boolean[] = [];
    const c = new Content(
      () => {
        getterInvoked.push(true);
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
    );
    assertEquals(getterInvoked, []);
    assertStrictEquals(await c.getBody(), contentBodyValue);
    assertEquals(getterInvoked, [true]);
    assertStrictEquals(await c.getBody(), contentBodyValue);
    assertEquals(getterInvoked, [true]);
  });
}

Deno.test("Content.encoding", () => {
  const c = new Content("", "text/plain; charset=UTF8");
  assertEquals(c.encoding, "utf-8");
});

Deno.test("Content.key", () => {
  const c = new Content("", "text/plain; charset=UTF8");
  assertEquals(c.key, ContentKey.get("text/plain; charset=utf-8"));
  const c2 = new Content("", "text/plain", "ko");
  assertEquals(c2.key, ContentKey.get("text/plain", "ko"));
});

Deno.test("Content.lastModified", () => {
  const lastModified = Date.UTC(1988, 8, 4, 1, 2, 3, 4);
  const d = new Date(lastModified);
  const c = new Content("", "text/plain", null, d);
  assertEquals(c.lastModified, d);
  d.setFullYear(2021);
  assertEquals(c.lastModified, new Date(lastModified));
  c.lastModified.setFullYear(2000);
  assertEquals(c.lastModified, new Date(lastModified));
});

Deno.test("ContentKey.get()", () => {
  const txt = ContentKey.get(MediaType.fromString("text/plain"));
  assertStrictEquals(txt.type, MediaType.get("text", "plain"));
  assertStrictEquals(txt.language, null);
  const txtEn = ContentKey.get("text/plain", LanguageTag.fromString("en"));
  assertStrictEquals(txtEn.type, MediaType.get("text", "plain"));
  assertStrictEquals(txtEn.language, LanguageTag.get("en"));
  assertNotStrictEquals(txtEn, txt);
  const txtEnUS = ContentKey.get("text/plain", "en-US");
  assertStrictEquals(txtEnUS.type, MediaType.get("text", "plain"));
  assertStrictEquals(txtEnUS.language, LanguageTag.get("en", null, "US"));
  assertNotStrictEquals(txtEnUS, txt);
  assertNotStrictEquals(txtEnUS, txtEn);
  const html = ContentKey.get(MediaType.fromString("text/html"));
  assertStrictEquals(html.type, MediaType.get("text", "html"));
  assertStrictEquals(html.language, null);
  assertNotStrictEquals(html, txt);
  assertNotStrictEquals(html, txtEn);
  assertNotStrictEquals(html, txtEnUS);
  const htmlEn = ContentKey.get("text/html", "en");
  assertStrictEquals(htmlEn.type, MediaType.get("text", "html"));
  assertStrictEquals(htmlEn.language, LanguageTag.get("en"));
  assertNotStrictEquals(htmlEn, txt);
  assertNotStrictEquals(htmlEn, txtEn);
  assertNotStrictEquals(htmlEn, txtEnUS);
  assertNotStrictEquals(htmlEn, html);
  // Interning:
  assertStrictEquals(ContentKey.get("text/plain"), txt);
  assertStrictEquals(ContentKey.get("text/plain", "en"), txtEn);
  assertStrictEquals(ContentKey.get("text/plain", "en-US"), txtEnUS);
  assertStrictEquals(ContentKey.get("text/html"), html);
  assertStrictEquals(ContentKey.get("text/html", "en"), htmlEn);
  // Invalid arguments:
  assertThrows(() => ContentKey.get("invalid-mime"), MediaTypeError);
  assertThrows(
    () => ContentKey.get("text/plain", "invalid-lang-tag"),
    LanguageTagError,
  );
});

Deno.test("ContentKey.toString()", () => {
  const txt = ContentKey.get("text/plain");
  assertStrictEquals(txt.toString(), 'ContentKey { type: "text/plain" }');
  const htmlEn = ContentKey.get("text/html", "en");
  assertStrictEquals(
    htmlEn.toString(),
    'ContentKey { type: "text/html", language: "en" }',
  );
});
