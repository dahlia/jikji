import {
  extractFromPath,
  extractFromUrl,
  havingExtension,
  identity,
  intoDirectory,
  isBasedOn,
  rebase,
  relativePathToFileUrl,
  removeBase,
  replaceBasename,
  when,
} from "./path.ts";
import { Content, Resource } from "./resource.ts";
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.101.0/testing/asserts.ts";
import { resolve, toFileUrl } from "https://deno.land/std@0.101.0/path/mod.ts";

Deno.test("identity()", () => {
  const p1 = new URL("https://example.com/foo/bar.php?baz=1#qux");
  assertEquals(identity(p1), p1);
  const p2 = new URL("file:///tmp/foo/bar.html");
  assertEquals(identity(p2), p2);
});

Deno.test("when()", () => {
  function appendAnchor(path: URL) {
    path.hash = "#appended";
    return path;
  }
  let append = true;
  const mayAppendAnchor = when(() => append, appendAnchor);
  assertEquals(
    mayAppendAnchor(new URL("https://example.com/")),
    new URL("https://example.com/#appended"),
  );
  assertEquals(
    mayAppendAnchor(new URL("file:///tmp/foo/bar.html")),
    new URL("file:///tmp/foo/bar.html#appended"),
  );
  append = false;
  assertEquals(
    mayAppendAnchor(new URL("https://example.com/")),
    new URL("https://example.com/"),
  );
  assertEquals(
    mayAppendAnchor(new URL("file:///tmp/foo/bar.html")),
    new URL("file:///tmp/foo/bar.html"),
  );
  function appendQuery(path: URL) {
    path.search = "?appended";
    return path;
  }
  let anchor = true;
  const mayAppendQueryOrAnchor = when(() => anchor, appendAnchor, appendQuery);
  assertEquals(
    mayAppendQueryOrAnchor(new URL("https://example.com/")),
    new URL("https://example.com/#appended"),
  );
  assertEquals(
    mayAppendQueryOrAnchor(new URL("file:///tmp/foo/bar.html")),
    new URL("file:///tmp/foo/bar.html#appended"),
  );
  anchor = false;
  assertEquals(
    mayAppendQueryOrAnchor(new URL("https://example.com/")),
    new URL("https://example.com/?appended"),
  );
  assertEquals(
    mayAppendQueryOrAnchor(new URL("file:///tmp/foo/bar.html")),
    new URL("file:///tmp/foo/bar.html?appended"),
  );
});

Deno.test("havingExtension()", () => {
  const endsWithTsOrTsx = havingExtension("ts", "tsx");
  assert(!endsWithTsOrTsx(new URL("https://example.com/")));
  assert(!endsWithTsOrTsx(new URL("https://example.com/foo/")));
  assert(!endsWithTsOrTsx(new URL("https://example.com/foo/bar.php")));
  assert(endsWithTsOrTsx(new URL("https://example.com/foo/bar.ts")));
  assert(endsWithTsOrTsx(new URL("https://example.com/foo/bar.tsx")));
  assert(!endsWithTsOrTsx(new URL("file:///tmp/foo/")));
  assert(!endsWithTsOrTsx(new URL("file:///tmp/foo/bar.html")));
  assert(endsWithTsOrTsx(new URL("file:///tmp/foo/bar.ts")));
  assert(endsWithTsOrTsx(new URL("file:///tmp/foo/bar.tsx")));
  assert(!endsWithTsOrTsx(new URL("mailto:someone@example.com")));
});

Deno.test("replaceBasename", () => {
  const markdownToTxt = replaceBasename(/\.(md|markdown)$/, ".txt");
  assertEquals(
    markdownToTxt(new URL("https://example.com/")),
    new URL("https://example.com/"),
  );
  assertEquals(
    markdownToTxt(new URL("https://example.md")),
    new URL("https://example.md"),
  );
  assertEquals(
    markdownToTxt(new URL("https://example.com/foo.md?bar=1")),
    new URL("https://example.com/foo.txt?bar=1"),
  );
  assertEquals(
    markdownToTxt(new URL("https://example.com/foo.markdown#baz")),
    new URL("https://example.com/foo.txt#baz"),
  );
  assertEquals(
    markdownToTxt(new URL("https://example.com/foo.html")),
    new URL("https://example.com/foo.html"),
  );
  const removeLang = replaceBasename(/\.([a-z][a-z])\.(html?|txt)$/, ".$2");
  assertEquals(
    removeLang(new URL("https://example.com/foo.en.html")),
    new URL("https://example.com/foo.html"),
  );
  assertEquals(
    removeLang(new URL("https://example.com/foo.ko.htm")),
    new URL("https://example.com/foo.htm"),
  );
  assertEquals(
    removeLang(new URL("https://example.com/foo.hi.txt")),
    new URL("https://example.com/foo.txt"),
  );
});

Deno.test("intoDirectory()", () => {
  const f = intoDirectory();
  assertEquals(
    f(new URL("file:///tmp/foo/bar")),
    new URL("file:///tmp/foo/bar/"),
  );
  assertEquals(
    f(new URL("file:///tmp/foo/bar/")),
    new URL("file:///tmp/foo/bar/"),
  );
  assertEquals(
    f(new URL("file:///tmp/foo/bar.md")),
    new URL("file:///tmp/foo/bar/"),
  );
  assertEquals(
    f(new URL("file:///tmp/foo/bar.md/")),
    new URL("file:///tmp/foo/bar.md/"),
  );

  const f2 = intoDirectory(false);
  assertEquals(
    f2(new URL("file:///tmp/foo/bar")),
    new URL("file:///tmp/foo/bar/"),
  );
  assertEquals(
    f2(new URL("file:///tmp/foo/bar/")),
    new URL("file:///tmp/foo/bar/"),
  );
  assertEquals(
    f2(new URL("file:///tmp/foo/bar.md")),
    new URL("file:///tmp/foo/bar.md/"),
  );
  assertEquals(
    f2(new URL("file:///tmp/foo/bar.md")),
    new URL("file:///tmp/foo/bar.md/"),
  );
});

Deno.test("rebase()", () => {
  const r = rebase(new URL("file:///tmp/foo/"), new URL("http://example.com/"));
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
    () => rebase(new URL("file:///tmp/foo/"), new URL("https://example.com/x")),
    TypeError,
    "must end with a slash",
  );
  assertThrows(
    () => rebase(new URL("file:///tmp/foo/"), "./foo"),
    TypeError,
    "must end with a slash",
  );
});

Deno.test("relativePathToFileUrl()", () => {
  assertEquals(
    relativePathToFileUrl("foo/bar"),
    toFileUrl(resolve("foo/bar")),
  );
  assertEquals(
    relativePathToFileUrl("foo/"),
    toFileUrl(resolve("foo") + "/"),
  );
  assertEquals(
    relativePathToFileUrl(new URL("https://example/com/")),
    new URL("https://example/com/"),
  );
});

Deno.test("isBasedOn()", () => {
  const example = new URL("https://example.com/");
  const exampleFoo = new URL("https://example.com/foo/");
  const exampleFoo_ = new URL("https://example.com/foo");
  const exampleBar = new URL("https://example.com/bar/");
  const exampleFooBar = new URL("https://example.com/foo/bar");
  const other = new URL("https://other.net/");
  const search = new URL("https://example.com/?search=1");
  const hash = new URL("https://example.com/#hash");
  assert(isBasedOn(exampleFoo, example));
  assert(isBasedOn(exampleFoo_, example));
  assert(isBasedOn(exampleBar, example));
  assert(isBasedOn(exampleFooBar, example));
  assert(!isBasedOn(other, example));
  assert(!isBasedOn(example, exampleFoo));
  assert(isBasedOn(exampleFooBar, exampleFoo));
  assert(!isBasedOn(exampleFoo_, exampleFoo));
  assert(!isBasedOn(exampleBar, exampleFoo));
  assert(!isBasedOn(other, exampleFoo));
  assert(!isBasedOn(exampleFooBar, exampleBar));
  assertThrows(
    () => isBasedOn(exampleFooBar, exampleFoo_),
    TypeError,
    "must end with a slash",
  );
  assertThrows(
    () => isBasedOn(exampleFooBar, search),
    TypeError,
    "must not have search",
  );
  assertThrows(
    () => isBasedOn(exampleFooBar, hash),
    TypeError,
    "must not have",
  );
});

Deno.test("removeBase()", () => {
  const example = new URL("https://example.com/");
  const exampleFoo = new URL("https://example.com/foo/");
  const exampleFooBar = new URL("https://example.com/foo/bar?a=1&b=2");
  const exampleFooBaz = new URL("https://example.com/foo/baz#hash");
  assertEquals(removeBase(example, example), "");
  assertEquals(removeBase(exampleFoo, example), "foo/");
  assertEquals(removeBase(exampleFooBar, example), "foo/bar?a=1&b=2");
  assertEquals(removeBase(exampleFooBaz, example), "foo/baz#hash");
  assertThrows(() => removeBase(example, exampleFoo), TypeError, "not based");
});

Deno.test("extractFromUrl()", () => {
  assertEquals(
    extractFromUrl(new URL("https://example.com/foo/bar"), /^\w+/),
    "https",
  );
  assertEquals(
    extractFromUrl(new URL("https://example.com/foo/bar"), /^\d+/),
    null,
  );

  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\w+/,
      { base: new URL("https://example.com/") },
    ),
    "foo",
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\d+/,
      { base: new URL("https://example.com/") },
    ),
    null,
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\w+/,
      { base: new URL("https://example.com/foo/") },
    ),
    "bar",
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\d+/,
      { base: new URL("https://example.com/foo/") },
    ),
    null,
  );
  assertThrows(
    () =>
      extractFromUrl(
        new URL("https://example.com/foo/bar"),
        /^\w+/,
        { base: new URL("file:///tmp") },
      ),
    TypeError,
  );
  assertThrows(
    () =>
      extractFromUrl(
        new URL("https://example.com/foo/bar"),
        /^\w+/,
        { base: new URL("file:///tmp/") },
      ),
    TypeError,
  );

  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\w+/,
      { convert: (match) => match && match[0].toUpperCase() },
    ),
    "HTTPS",
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\d+/,
      { convert: (match) => match && match[0].toUpperCase() },
    ),
    null,
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\w+/,
      {
        base: new URL("https://example.com/"),
        convert: (match: RegExpMatchArray | null) =>
          match && match[0].toUpperCase(),
      },
    ),
    "FOO",
  );
  assertEquals(
    extractFromUrl(
      new URL("https://example.com/foo/bar"),
      /^\d+/,
      {
        base: new URL("https://example.com/"),
        convert: (match: RegExpMatchArray | null) =>
          match && match[0].toUpperCase(),
      },
    ),
    null,
  );
});

Deno.test("extractFromPath()", () => {
  const r = new Resource("file:///tmp/foo/123/bar/", [
    new Content("", "text/plain"),
  ]);
  assertEquals(extractFromPath(r, /(\w+)\W/), "file:");
  assertEquals(
    extractFromPath(r, /(\w+)\W/, { base: new URL("file:///tmp/") }),
    "foo/",
  );
  assertEquals(
    extractFromPath(r, /(\w+)\W/, {
      base: new URL("file:///tmp/"),
      convert: (match: RegExpMatchArray | null) =>
        match == null ? "" : match[1],
    }),
    "foo",
  );
  assertEquals(
    extractFromPath(r, /(\w+)\W/, {
      base: new URL("file:///tmp/foo/"),
      convert: (match: RegExpMatchArray | null) =>
        match == null ? -1 : parseInt(match[1]),
    }),
    123,
  );
});
