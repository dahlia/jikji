import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import { assertEquals$ } from "./asserts.ts";
import {
  Content,
  ContentKey,
  ContentKeyError,
  ContentMetadata,
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
    let loaderInvoked = false;
    const lastModified = Date.UTC(1988, 8, 4, 1, 2, 3, 4);
    const c = new Content(
      () => {
        loaderInvoked = true;
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
      "en-US",
      new Date(lastModified),
      { foo: 123, bar: "baz" },
    );
    assert(!loaderInvoked);
    assertStrictEquals(c.type, MediaType.get("text", "plain"));
    assertStrictEquals(c.language, LanguageTag.get("en", null, "US"));
    assertEquals(c.lastModified, new Date(lastModified));
    assertEquals(await c.getBody(), contentBodyValue);
    assertEquals(await c.getMetadata(), { foo: 123, bar: "baz" });

    // optional fields are omitted:
    loaderInvoked = false;
    const before = new Date();
    const c2 = new Content(
      () => {
        loaderInvoked = true;
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
    );
    const after = new Date();
    assert(!loaderInvoked);
    assertStrictEquals(c2.type, MediaType.get("text", "plain"));
    assertStrictEquals(c2.language, null);
    assert(before <= c2.lastModified);
    assert(c2.lastModified <= after);
    assertEquals(await c2.getBody(), contentBodyValue);
    assertEquals(await c2.getMetadata(), {});

    // non-lazy body:
    const c3 = new Content(contentBodyValue, "text/plain");
    assertStrictEquals(c3.type, MediaType.get("text", "plain"));
    assertStrictEquals(c3.language, null);
    assertEquals(await c2.getBody(), contentBodyValue);

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
    const loaderInvoked: boolean[] = [];
    const c = new Content(
      () => {
        loaderInvoked.push(true);
        return Promise.resolve(contentBodyValue);
      },
      "text/plain",
    );
    assertEquals(loaderInvoked, []);
    assertEquals(await c.getBody(), contentBodyValue);
    assertEquals(loaderInvoked, [true]);
    assertEquals(await c.getBody(), contentBodyValue);
    assertEquals(loaderInvoked, [true]);

    const body = await c.getBody();
    if (contentBodyValue instanceof Uint8Array && body instanceof Uint8Array) {
      // Mutating the return value of Content.getBody() does not affect
      // the Content instance's internal buffer:
      body.set(new Uint8Array(body.length), 0);
      assertEquals(await c.getBody(), contentBodyValue);

      // Mutating the input buffer does not affect the Content instance's
      // internal buffer:
      const buffer = contentBodyValue.slice(0);
      const scalarValue = new Content(buffer, "text/plain");
      const scalarCallback = new Content(
        () => Promise.resolve(buffer),
        "text/plain",
      );
      const tupleCallback = new Content(
        () => Promise.resolve([buffer]),
        "text/plain",
      );
      buffer.set(new Uint8Array(body.length), 0);
      assertEquals(await scalarValue.getBody(), contentBodyValue);
      assertEquals(await scalarCallback.getBody(), contentBodyValue);
      assertEquals(await tupleCallback.getBody(), contentBodyValue);
    }
  });
}

Deno.test("Content.getMetadata()", async () => {
  const loaderInvoked: boolean[] = [];
  const init: ContentMetadata = { foo: 1, bar: null };
  const c = new Content(
    () => {
      loaderInvoked.push(true);
      return Promise.resolve(["", { bar: 2, baz: 3 }]);
    },
    "text/plain",
    null,
    null,
    init,
  );
  assertEquals(loaderInvoked, []);
  assertEquals(await c.getMetadata(), { foo: 1, bar: 2, baz: 3 });
  assertEquals(loaderInvoked, [true]);
  assertEquals(await c.getMetadata(), { foo: 1, bar: 2, baz: 3 });
  assertEquals(loaderInvoked, [true]);

  // Mutating the return value of Content.getBody() does not affect
  // the Content instance's internal buffer:
  const returned = await c.getMetadata();
  assert(returned != null);
  returned.mutate = true;
  assertEquals(await c.getMetadata(), { foo: 1, bar: 2, baz: 3 });

  // Mutating the input buffer does not affect the Content instance's
  // internal buffer:
  const init2 = { ...init };
  const scalarValue = new Content("", "text/plain", null, null, init2);
  const scalarCallback = new Content(
    () => Promise.resolve(["", init2]),
    "text/plain",
  );
  const tupleCallback = new Content(
    () => Promise.resolve(["", init2]),
    "text/plain",
  );
  const scalarValueMetadata = await scalarValue.getMetadata();
  const scalarCallbackMetadata = await scalarCallback.getMetadata();
  const tupleCallbackMetadata = await tupleCallback.getMetadata();
  init2.mutate = true;
  assertEquals(scalarValueMetadata, init);
  assertEquals(scalarCallbackMetadata, init);
  assertEquals(tupleCallbackMetadata, init);
});

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

const mediaTypeLikeTypes: Record<string, (_: string) => MediaType | string> = {
  string: (s) => s,
  MediaType: MediaType.fromString.bind(MediaType),
};
for (const [typeName, c] of Object.entries(mediaTypeLikeTypes)) {
  Deno.test(`Content.matches({ type|exactType: ${typeName} })`, () => {
    const txt = new Content("", "text/plain");
    const txtAscii = new Content("", "text/plain; charset=ascii");
    const txtUtf8 = new Content("", "text/plain; charset=utf8");
    const html = new Content("", "text/html");

    // type:
    assert(txt.matches({ type: c("text/plain") }));
    assert(!txt.matches({ type: c("text/plain; charset=utf-8") }));
    assert(txtAscii.matches({ type: c("text/plain") }));
    assert(!txtAscii.matches({ type: c("text/plain; charset=utf-8") }));
    assert(txtUtf8.matches({ type: c("text/plain") }));
    assert(txtUtf8.matches({ type: c("text/plain; charset=utf-8") }));
    assert(!html.matches({ type: c("text/plain") }));
    assert(!html.matches({ type: c("text/plain; charset=utf-8") }));

    // exactType:
    assert(txt.matches({ exactType: c("text/plain") }));
    assert(!txt.matches({ exactType: c("text/plain; charset=utf-8") }));
    assert(!txtAscii.matches({ exactType: c("text/plain") }));
    assert(!txtAscii.matches({ exactType: c("text/plain; charset=utf-8") }));
    assert(!txtUtf8.matches({ exactType: c("text/plain") }));
    assert(txtUtf8.matches({ exactType: c("text/plain; charset=utf-8") }));
    assert(!html.matches({ exactType: c("text/plain") }));
    assert(!html.matches({ exactType: c("text/plain; charset=utf-8") }));

    // both:
    assert(txt.matches({ type: c("text/plain"), exactType: c("text/plain") }));
    assert(
      !txt.matches({
        type: c("text/plain"),
        exactType: c("text/plain; charset=ascii"),
      }),
    );
    assert(
      !txtAscii.matches({ type: c("text/plain"), exactType: c("text/plain") }),
    );
    assert(
      txtAscii.matches({
        type: c("text/plain"),
        exactType: c("text/plain; charset=ascii"),
      }),
    );
  });
}

const langTagLikeTypes: Record<string, (_: string) => LanguageTag | string> = {
  string: (s) => s,
  LanguageTag: LanguageTag.fromString.bind(LanguageTag),
};
for (const [typeName, c] of Object.entries(langTagLikeTypes)) {
  Deno.test(`Content.matches({ language|exactLanguage: ${typeName} })`, () => {
    const empty = new Content("", "text/plain");
    const ko = new Content("", "text/plain", "ko");
    const koHang = new Content("", "text/plain", "ko-Hang");
    const koKR = new Content("", "text/plain", "ko-KR");

    // language:
    assert(!empty.matches({ language: c("ko") }));
    assert(!empty.matches({ language: c("ko-Hang") }));
    assert(!empty.matches({ language: c("ko-Kore") }));
    assert(!empty.matches({ language: c("ko-KR") }));
    assert(!empty.matches({ language: c("ko-KP") }));
    assert(!empty.matches({ language: c("en") }));
    assert(ko.matches({ language: c("ko") }));
    assert(!ko.matches({ language: c("ko-Hang") }));
    assert(!ko.matches({ language: c("ko-Kore") }));
    assert(!ko.matches({ language: c("ko-KR") }));
    assert(!ko.matches({ language: c("ko-KP") }));
    assert(!ko.matches({ language: c("en") }));
    assert(koHang.matches({ language: c("ko") }));
    assert(koHang.matches({ language: c("ko-Hang") }));
    assert(!koHang.matches({ language: c("ko-Kore") }));
    assert(!koHang.matches({ language: c("ko-KR") }));
    assert(!koHang.matches({ language: c("ko-KP") }));
    assert(!koHang.matches({ language: c("en") }));
    assert(koKR.matches({ language: c("ko") }));
    assert(!koKR.matches({ language: c("ko-Hang") }));
    assert(!koKR.matches({ language: c("ko-Kore") }));
    assert(koKR.matches({ language: c("ko-KR") }));
    assert(!koKR.matches({ language: c("ko-KP") }));
    assert(!koKR.matches({ language: c("en") }));

    // exactLanguage:
    assert(!empty.matches({ exactLanguage: c("ko") }));
    assert(!empty.matches({ exactLanguage: c("ko-Hang") }));
    assert(!empty.matches({ exactLanguage: c("ko-Kore") }));
    assert(!empty.matches({ exactLanguage: c("ko-KR") }));
    assert(!empty.matches({ exactLanguage: c("ko-KP") }));
    assert(!empty.matches({ exactLanguage: c("en") }));
    assert(ko.matches({ exactLanguage: c("ko") }));
    assert(!ko.matches({ exactLanguage: c("ko-Hang") }));
    assert(!ko.matches({ exactLanguage: c("ko-Kore") }));
    assert(!ko.matches({ exactLanguage: c("ko-KR") }));
    assert(!ko.matches({ exactLanguage: c("ko-KP") }));
    assert(!ko.matches({ exactLanguage: c("en") }));
    assert(!koHang.matches({ exactLanguage: c("ko") }));
    assert(koHang.matches({ exactLanguage: c("ko-Hang") }));
    assert(!koHang.matches({ exactLanguage: c("ko-Kore") }));
    assert(!koHang.matches({ exactLanguage: c("ko-KR") }));
    assert(!koHang.matches({ exactLanguage: c("ko-KP") }));
    assert(!koHang.matches({ exactLanguage: c("en") }));
    assert(!koKR.matches({ exactLanguage: c("ko") }));
    assert(!koKR.matches({ exactLanguage: c("ko-Hang") }));
    assert(!koKR.matches({ exactLanguage: c("ko-Kore") }));
    assert(koKR.matches({ exactLanguage: c("ko-KR") }));
    assert(!koKR.matches({ exactLanguage: c("ko-KP") }));
    assert(!koKR.matches({ exactLanguage: c("en") }));
  });
}

Deno.test("Content.replace()", async () => {
  const t = "text/plain";
  const d = new Date(Date.UTC(2000, 0, 1));
  const m = { foo: 1, bar: 2 };
  const c = new Content("foo", t, "en", d, m);
  const newBody = c.replace({ body: "bar" });
  await assertEquals$(newBody, new Content("bar", t, "en", d, m));
  await assertEquals$(c, new Content("foo", t, "en", d, m));
  const newType = c.replace({ type: "text/html" });
  await assertEquals$(
    newType,
    new Content("foo", "text/html", "en", d, m),
  );
  const newLang = c.replace({ language: null });
  await assertEquals$(newLang, new Content("foo", t, null, d, m));
  const newDate = new Date();
  const newLastModified = c.replace({ lastModified: newDate });
  await assertEquals$(
    newLastModified,
    new Content("foo", t, "en", newDate, m),
  );
  const newMeta = c.replace({ metadata: { bar: 3, baz: 4 } });
  await assertEquals$(
    newMeta,
    new Content("foo", t, "en", d, { bar: 3, baz: 4 }),
  );
  const c2 = c.replace({
    type: "text/html",
    language: "ko",
    lastModified: newDate,
  });
  await assertEquals(
    c2,
    new Content("foo", "text/html", "ko", newDate, m),
  );
});

Deno.test("Content.matches({ ... })", () => {
  const txtUtf8KoKR = new Content("", "text/plain; charset=utf-8", "ko-KR");

  assert(txtUtf8KoKR.matches({ type: "text/plain", language: "ko" }));
  assert(!txtUtf8KoKR.matches({ type: "text/plain", exactLanguage: "ko" }));
  assert(
    txtUtf8KoKR.matches({
      exactType: "text/plain; charset=utf-8",
      language: "ko-KR",
    }),
  );
  assert(!txtUtf8KoKR.matches({ type: "text/plain", language: "en" }));
  assert(
    !txtUtf8KoKR.matches({ exactType: "text/plain", exactLanguage: "ko-KR" }),
  );
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

Deno.test("ContentKeyError()", () => {
  const e = new ContentKeyError();
  assertEquals(e.message, "");
  assertEquals(e.name, "ContentKeyError");
  const e2 = new ContentKeyError("error message");
  assertEquals(e2.message, "error message");
  assertEquals(e2.name, "ContentKeyError");
});
