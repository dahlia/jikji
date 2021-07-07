import { intoDirectory, isBasedOn, rebase, removeBase } from "./path.ts";
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import { resolve, toFileUrl } from "https://deno.land/std@0.99.0/path/mod.ts";

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
