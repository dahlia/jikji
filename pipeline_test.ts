import { basename } from "https://deno.land/std@0.102.0/path/mod.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.102.0/testing/asserts.ts";
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
  ResourceSet,
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
  const resources = makeResources({ "foo.txt": "", "bar.txt": "" });
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
  const resources = makeResources({ "foo.txt": "", "bar.txt": "" });
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

Deno.test({
  name: "Pipeline(() => AsyncIterable<Resource>, AsyncIterable<void>)",
  async fn() {
    let step = 0;
    async function* getResources(): AsyncIterable<Resource> {
      yield* makeResources({ "foo.md": "" });
      if (step == 1) {
        yield* makeResources({ "bar.md": "" });
      } else if (step == 2) {
        yield* makeResources({ "baz.md": "" });
      }
    }
    async function* monitor(): AsyncIterable<void> {
      yield;
      yield;
    }
    const logs: { step: number; path: URL }[] = [];
    function log(resource: Resource) {
      logs.push({ step, path: resource.path });
    }
    await new Pipeline(getResources, monitor())
      .move((p) =>
        new URL(`file:///tmp/${basename(p.pathname).replace(/\.md$/, ".txt")}`)
      )
      .forEachWithReloading(log, () => step++);
    assertEquals(logs, [
      { step: 0, path: new URL("file:///tmp/foo.txt") },
      { step: 1, path: new URL("file:///tmp/foo.txt") },
      { step: 1, path: new URL("file:///tmp/bar.txt") },
      { step: 2, path: new URL("file:///tmp/foo.txt") },
      { step: 2, path: new URL("file:///tmp/baz.txt") },
    ]);
  },
});

Deno.test("Pipeline#union()", async () => {
  function pathCmp(a: Resource, b: Resource) {
    return a.path.toString() < b.path.toString() ? -1 : 1;
  }

  const r1 = makeResources({ "foo.txt": "", "bar.txt": "" })
    .sort(pathCmp);
  const p1 = new Pipeline(r1);
  const r2 = makeResources({ "bar.txt": "dup", "baz.txt": "" })
    .sort(pathCmp);
  const p2 = new Pipeline(r2);

  const p12 = p1.union(p2);
  await assertEquals$(
    (await toArray(p12)).sort(pathCmp),
    [r1[0], r2[1], r1[1]],
  );

  const p21 = p2.union(p1);
  await assertEquals$((await toArray(p21)).sort(pathCmp), [...r2, r1[1]]);
});

Deno.test("Pipeline#getLastModified()", async () => {
  const d1 = new Date(0);
  const resources = makeResources({ "foo.txt": "", "bar.txt": "" }, d1);
  const p1 = new Pipeline(resources);
  assertEquals(await p1.getLastModified(), d1);

  const d2 = new Date();
  const p2 = p1.union(new Pipeline(makeResources({ "baz.txt": "" }, d2)));
  assertEquals(await p2.getLastModified(), d2);
});

Deno.test("Pipeline#add()", async () => {
  function pathCmp(a: Resource, b: Resource) {
    return a.path.toString() < b.path.toString() ? -1 : 1;
  }

  const resources = makeResources({ "foo.txt": "", "bar.txt": "" })
    .sort(pathCmp);
  const [r1, r2] = makeResources({ "baz.txt": "", "foo.txt": "dp" })
    .sort(pathCmp);
  const p1 = new Pipeline(resources);

  const p2 = p1.add(r1);
  await assertEquals$(
    (await toArray(p2)).sort(pathCmp),
    [resources[0], r1, resources[1]],
  );

  const p3 = p1.add(r2);
  await assertEquals$((await toArray(p3)).sort(pathCmp), [resources[0], r2]);
});

const summarizerReturnTypes: Record<
  string,
  (r: Resource) => (
    | Resource
    | Promise<Resource>
    | Iterable<Resource>
    | AsyncIterable<Resource>
  )
> = {
  Resource: (r) => r,
  "Promise<Resource>": (r) => Promise.resolve(r),
  "Iterable<Resource>": function* (r) {
    yield r;
  },
  "AsyncIterable<Resource>": async function* (r) {
    yield r;
  },
};

for (const [typeName, castToType] of Object.entries(summarizerReturnTypes)) {
  Deno.test(`Pipeline#addSummaries(${typeName})`, async () => {
    function pathCmp(a: Resource, b: Resource) {
      return a.path.toString() < b.path.toString() ? -1 : 1;
    }

    const resources = Array.from(
      makeResources({ "a.txt": "", "b.txt": "", "c.md": "", "d.md": "" }),
    );
    const p = new Pipeline(resources);
    const d = new Date();
    const p2 = p.addSummaries((pipeline) =>
      castToType(
        new Resource("file:///tmp/site/", [
          new Content(
            async () => {
              const rs = (await toArray(pipeline));
              const paths = rs.map((r) => r.path.toString());
              const body = paths.sort().join("\n");
              return body;
            },
            "text/html",
            null,
            d,
          ),
        ]),
      )
    );
    const paths = resources.map((r) => r.path.toString()).sort().join("\n");
    await assertEquals$(
      (await toArray(p2)).sort(pathCmp),
      [
        new Resource("file:///tmp/site/", [
          new Content(paths, "text/html", null, d),
        ]),
        ...(await toArray(p)).sort(pathCmp),
      ],
    );
  });
}

Deno.test("Pipeline#map()", async () => {
  const resources = makeResources({
    "foo.txt": "foo",
    "bar.txt": "bar",
    "baz.txt": "baz",
  });
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

Deno.test("Pipeline#filter()", async () => {
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

Deno.test("Pipeline#groupBy()", async () => {
  const d = new Date();
  const resources = () =>
    makeResources({
      "foo.md": "foo",
      "bar.md": "bar",
      "baz.txt": "baz",
      "qux.txt": "qux",
      "quux.html": "quux",
    }, d);
  const p = new Pipeline(resources());
  const g1 = await p.groupBy((r) => r.path.pathname.match(/[^.]+$/)![0]);
  await assertEquals$(
    new Map([
      [
        "md",
        new ResourceSet(makeResources({ "foo.md": "foo", "bar.md": "bar" }, d)),
      ],
      [
        "txt",
        new ResourceSet(
          makeResources({ "baz.txt": "baz", "qux.txt": "qux" }, d),
        ),
      ],
      ["html", new ResourceSet(makeResources({ "quux.html": "quux" }, d))],
    ]),
    g1,
  );

  const g2 = await p.groupBy((r) =>
    r.path.pathname.match(/([^/.]+)\.[^.]+$/)![1].length
  );
  await assertEquals$(
    new Map([
      [
        3,
        new ResourceSet(
          makeResources({
            "foo.md": "foo",
            "bar.md": "bar",
            "baz.txt": "baz",
            "qux.txt": "qux",
          }, d),
        ),
      ],
      [4, new ResourceSet(makeResources({ "quux.html": "quux" }, d))],
    ]),
    g2,
  );

  const g3 = await p.groupBy((r) => {
    const ext = r.path.pathname.match(/[^.]+$/)![0];
    return ext === "txt" ? undefined : ext;
  });
  await assertEquals$(
    new Map([
      [
        "md",
        new ResourceSet(makeResources({ "foo.md": "foo", "bar.md": "bar" }, d)),
      ],
      ["html", new ResourceSet(makeResources({ "quux.html": "quux" }, d))],
    ]),
    g3,
  );
});

Deno.test("ResourceSet#lastModified", () => {
  const d1 = new Date(1000000000000);
  const d2 = new Date(1200000000000);
  const d3 = new Date(1300000000000);
  const d4 = new Date(400000000000);
  const set = new ResourceSet([
    new Resource("file:///tmp/a", [new Content("", "text/plain", null, d1)]),
    new Resource("file:///tmp/b", [new Content("", "text/plain", null, d2)]),
    new Resource("file:///tmp/c", [new Content("", "text/plain", null, d3)]),
    new Resource("file:///tmp/d", [new Content("", "text/plain", null, d4)]),
  ]);
  assertEquals(set.lastModified, d3);
});

Deno.test("Pipeline#forEach()", async () => {
  const resources = makeResources({
    "foo.txt": "foo",
    "bar.txt": "bar",
    "baz.txt": "baz",
  });
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

Deno.test("Pipeline#move()", async () => {
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

Deno.test("Pipeline#transform()", async () => {
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
    makeResources({
      "foo.txt": "foo$",
      "bar.md": "bar",
      "baz.txt": "baz$",
    }, d),
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

Deno.test("Pipeline#diversify()", async () => {
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
