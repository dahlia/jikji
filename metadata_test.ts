import { assertEquals } from "https://deno.land/std@0.99.0/testing/asserts.ts";
import {
  queryAll,
  queryEarliestDate,
  queryLatestDate,
  queryPublished,
  queryString,
  queryTitle,
} from "./metadata.ts";
import { Content, Resource } from "./resource.ts";

async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const el of iterable) {
    result.push(el);
  }
  return result;
}

const d1 = new Date(0);
const d2 = new Date(100000);
const d3 = new Date(200000);
const fixture = new Resource("file:///tmp/foo", [
  new Content("", "text/plain", "en", null, { title: " ", published: d1 }),
  new Content("", "text/html", "en", null, { title: "Title", published: d2 }),
  new Content("", "text/markdown", "ko", null, {
    title: "Title",
    published: d3,
  }),
]);

Deno.test("queryAll()", async () => {
  assertEquals(
    (await toArray(queryAll(fixture, "title"))).sort(),
    [" ", "Title", "Title"],
  );
  assertEquals(
    await toArray(
      queryAll(fixture, "title", (c) => !c.type.matches("text/plain")),
    ),
    ["Title", "Title"],
  );
});

Deno.test("queryString()", async () => {
  assertEquals(await queryString(fixture, "title"), " ");
  assertEquals(
    await queryString(fixture, "title", { type: "text/html" }),
    "Title",
  );
  assertEquals(await queryString(fixture, "title", undefined, true), "Title");
  assertEquals(
    await queryString(fixture, "title", { type: "text/plain" }, true),
    null,
  );
});

Deno.test("queryLatestDate()", async () => {
  assertEquals(await queryLatestDate(fixture, "published"), d3);
  assertEquals(
    await queryLatestDate(fixture, "published", { language: "en" }),
    d2,
  );
});

Deno.test("queryEarliestDate()", async () => {
  assertEquals(await queryEarliestDate(fixture, "published"), d1);
  assertEquals(
    await queryEarliestDate(fixture, "published", { language: "ko" }),
    d3,
  );
});

Deno.test("queryPublished()", async () => {
  assertEquals(await queryPublished(fixture), d1);
  assertEquals(await queryPublished(fixture, { language: "ko" }), d3);
});

Deno.test("queryTitle()", async () => {
  assertEquals(await queryTitle(fixture), "Title");
  assertEquals(await queryTitle(fixture, { type: "text/html" }), "Title");
  assertEquals(await queryTitle(fixture, { type: "text/plain" }), null);
});
