import { basename } from "https://deno.land/std@0.99.0/path/mod.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.99.0/testing/asserts.ts";
import { assertEquals$ } from "./asserts.ts";
import { LanguageTag, LanguageTagError } from "./language_tag.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";
import { makeResources } from "./fixtures.ts";
import {
  Content,
  diversify,
  move,
  Pipeline,
  replace,
  Resource,
  transform,
} from "./pipeline.ts";

async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const el of iterable) {
    result.push(el);
  }
  return result;
}

Deno.test("Pipeline(AsyncIterable<Resource>)", async () => {
  const resources = Array.from(makeResources({ "foo.txt": "", "bar.txt": "" }));
  const asyncIterable = {
    [Symbol.asyncIterator]: async function* () {
      yield* resources;
    },
  };
  const p = new Pipeline(asyncIterable);
  await assertEquals$(await toArray(p), resources);

  const dupIterable = {
    [Symbol.asyncIterator]: async function* () {
      yield* resources;
      yield* makeResources({ "foo.txt": "dup" });
    },
  };
  const p2 = new Pipeline(dupIterable);
  await assertEquals$(await toArray(p2), resources);
});

Deno.test("Pipeline(Iterable<Resource>)", async () => {
  const resources = Array.from(makeResources({ "foo.txt": "", "bar.txt": "" }));
  const iterable = {
    [Symbol.iterator]: function* () {
      yield* resources;
    },
  };
  const p = new Pipeline(iterable);
  await assertEquals$(await toArray(p), resources);

  const dupIterable = {
    [Symbol.iterator]: function* () {
      yield* resources;
      yield* makeResources({ "foo.txt": "dup" });
    },
  };
  const p2 = new Pipeline(dupIterable);
  await assertEquals$(await toArray(p2), resources);
});

Deno.test("Pipeline.map()", async () => {
  const resources = Array.from(makeResources({
    "foo.txt": "foo",
    "bar.txt": "bar",
    "baz.txt": "baz",
  }));
  const p = new Pipeline(resources);
  await assertEquals$(await toArray(p), resources);
  const p2 = p.map((r) =>
    new Resource(new URL(r.path.toString() + "?transformed"), r)
  );
  let i = 0;
  for await (const transformed of p2) {
    const r = resources[i++];
    assertEquals(
      transformed.path.toString(),
      r.path.toString() + "?transformed",
    );
    assertEquals(Array.from(transformed), Array.from(r));
  }
  assertEquals(i, resources.length);
  await assertEquals$(await toArray(p), resources);
});

Deno.test("Pipeline.filter()", async () => {
  const d = new Date();
  const resources = () =>
    makeResources({
      "foo.md": "foo",
      "bar.md": "bar",
      "baz.txt": "baz",
    }, d);
  const p = new Pipeline(resources());
  await assertEquals$(await toArray(p), Array.from(resources()));
  const p2 = p.filter((r) => basename(r.path.pathname).startsWith("ba"));
  const expected = Array.from(
    makeResources({ "bar.md": "bar", "baz.txt": "baz" }, d),
  );
  await assertEquals$(await toArray(p2), expected);
  await assertEquals$(await toArray(p), Array.from(resources()));
  await assertEquals$(await toArray(p2), expected);
});

Deno.test("Pipeline.forEach()", async () => {
  const resources = Array.from(makeResources({
    "foo.txt": "foo",
    "bar.txt": "bar",
    "baz.txt": "baz",
  }));
  const p = new Pipeline(resources);
  const rs: [Resource, number][] = [];
  await p.forEach((r: Resource, i: number) => rs.push([r, i]));
  assertEquals(rs, Array.from(resources.map((r, i) => [r, i])));
  const rs2: Resource[] = [];
  await p.forEach((r: Resource) => rs2.push(r));
  await assertEquals$(rs2, resources);
});

Deno.test("move()", async () => {
  const c = new Content("", "text/plain");
  const r = new Resource("file:///tmp/foo.txt", [c]);
  const appendAnchor = move((path) => new URL(path.toString() + "#anchor"));
  const moved = appendAnchor(r);
  const expected = new Resource("file:///tmp/foo.txt#anchor", [c]);
  await assertEquals$(moved, expected);
});

Deno.test("Pipeline.move()", async () => {
  const d = new Date();
  const p = new Pipeline(
    makeResources(
      {
        "foo.txt": "foo",
        "bar.txt": "bar",
        "baz.txt": "baz",
      },
      d,
    ),
  );
  const p2 = p.move((path) => new URL(path.toString() + "?qs"));
  await assertEquals$(
    await toArray(p2),
    Array.from(
      makeResources(
        {
          "foo.txt?qs": "foo",
          "bar.txt?qs": "bar",
          "baz.txt?qs": "baz",
        },
        d,
      ),
    ),
  );
});

function addParameter(c: Content): Content {
  return new Content(
    async () => [await c.getBody(), await c.getMetadata()],
    c.type.withParameter("transformed", "1"),
    c.language,
    c.lastModified,
  );
}

function append$(c: Content): Content {
  return new Content(
    async () => {
      const body = await c.getBody();
      return [
        typeof body == "string" ? body + "$" : body,
        await c.getMetadata(),
      ];
    },
    c.type,
    c.language,
    c.lastModified,
  );
}

Deno.test("transform()", async () => {
  const txt = new Content("", "text/plain");
  const md = new Content("", "text/markdown");
  const r = new Resource("file:///tmp/foo.txt", [txt, md]);
  const addParameterToResource = transform(addParameter);
  const transformed = addParameterToResource(r);
  const transformedTxt = new Content(
    "",
    "text/plain; transformed=1",
    null,
    txt.lastModified,
  );
  const transformedMd = new Content(
    "",
    "text/markdown; transformed=1",
    null,
    md.lastModified,
  );
  await assertEquals$(
    transformed,
    new Resource(r.path, [transformedTxt, transformedMd]),
  );

  const addParameterToResourcePartially = transform(addParameter, {
    type: "text/plain",
  });
  const partiallyTransformed = addParameterToResourcePartially(r);
  await assertEquals$(
    partiallyTransformed,
    new Resource(r.path, [transformedTxt, md]),
  );

  const addParameterToResourcePartially2 = transform(
    addParameter,
    (c) => c.type === MediaType.fromString("text/plain"),
  );
  const partiallyTransformed2 = addParameterToResourcePartially2(r);
  await assertEquals$(partiallyTransformed2, partiallyTransformed);
});

Deno.test("Pipeline.transform()", async () => {
  const d = new Date();
  const p = new Pipeline(
    makeResources(
      {
        "foo.txt": "foo",
        "bar.md": "bar",
        "baz.txt": "baz",
      },
      d,
    ),
  );
  const transformed = p.transform(append$, { type: "text/plain" });
  await assertEquals$(
    await toArray(transformed),
    Array.from(makeResources(
      {
        "foo.txt": "foo$",
        "bar.md": "bar",
        "baz.txt": "baz$",
      },
      d,
    )),
  );
});

Deno.test("diversify()", async () => {
  const txt = new Content("foo", "text/plain");
  const md = new Content("bar", "text/markdown");
  const r = new Resource("https://foo/", [txt, md]);
  const addContentsWithParamsToResource = diversify(addParameter);
  const r2 = addContentsWithParamsToResource(r);
  await assertEquals$(
    r2,
    new Resource(
      "https://foo/",
      [
        txt,
        txt.replace({ type: "text/plain; transformed=1" }),
        md,
        md.replace({ type: "text/markdown; transformed=1" }),
      ],
    ),
  );

  const addContentsEndingWith$ToResource = diversify(
    (c) => addParameter(append$(c)),
    { type: "text/markdown" },
  );
  const r3 = addContentsEndingWith$ToResource(r);
  await assertEquals$(
    r3,
    r.addRepresentation(
      md.replace({ type: "text/markdown; transformed=1", body: "bar$" }),
    ),
  );

  const addContentsEndingWith$ToResource2 = diversify(
    (c) => addParameter(append$(c)),
    (c) => c.type === MediaType.fromString("text/markdown"),
  );
  const r4 = addContentsEndingWith$ToResource2(r);
  await assertEquals$(r3, r4);
});

Deno.test("Pipeline.diversify()", async () => {
  const d = new Date();
  const resources = Array.from(
    makeResources({
      "a.txt": "foo",
      "b.md": "bar",
      "c.txt": "baz",
    }, d),
  );
  resources.sort((a, b) => a.path.pathname < b.path.pathname ? -1 : 1);
  const p = new Pipeline(resources);
  const p2 = p.diversify(
    (c) => append$(c).replace({ type: "text/markdown" }),
    { type: "text/plain" },
  );
  await assertEquals$(await toArray(p2), [
    resources[0].addRepresentation(
      new Content("foo$", "text/markdown", null, d),
    ),
    resources[1],
    resources[2].addRepresentation(
      new Content("baz$", "text/markdown", null, d),
    ),
  ]);
});

Deno.test("replace()", async () => {
  const toKoMarkdown = replace({
    type: MediaType.fromString("text/markdown"),
    language: LanguageTag.fromString("ko"),
  });
  const d = new Date();
  const c = new Content("foo", "text/plain", null, d);
  const c2 = toKoMarkdown(c);
  await assertEquals$(c2, new Content("foo", "text/markdown", "ko", d));

  const removeLanguage = replace({ language: null });
  const c3 = removeLanguage(c2);
  await assertEquals$(c3, new Content("foo", "text/markdown", null, d));

  const toZhHtml = replace({
    type: "text/html; charset=utf-8",
    language: "zh",
  });
  const c4 = toZhHtml(c);
  await assertEquals$(
    c4,
    new Content("foo", "text/html; charset=utf-8", "zh", d),
  );

  assertThrows(() => replace({ type: "invalid" }), MediaTypeError);
  assertThrows(() => replace({ language: "invalid" }), LanguageTagError);
});
