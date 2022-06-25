/**
 * @copyright 2022 Hong Minhee
 * @license LGPL-3.0-only
 */
import { assertEquals$ } from "./asserts.ts";
import { abbr, frontMatter, markdown, MarkdownIt, title } from "./markdown.ts";
import { Content } from "./content.ts";

Deno.test("frontMatter()", async () => {
  const bodyTypes: (((_: string) => string) | ((_: string) => Uint8Array))[] = [
    String,
    (s) => new TextEncoder().encode(s),
  ];
  for (const bodyType of bodyTypes) {
    const nofm = new Content(
      bodyType("No front matter."),
      "text/markdown",
      "en",
      null,
      {
        foo: 1,
        bar: 2,
      },
    );
    await assertEquals$(frontMatter(nofm), nofm);

    const fm = new Content(
      bodyType(
        "---\ntitle: Front matter\nattr: true\n---\nIt has front matter.",
      ),
      "text/markdown",
      "en",
      null,
      { foo: 1, bar: 2 },
    );
    await assertEquals$(
      frontMatter(fm),
      fm.replace({
        body: "It has front matter.",
        metadata: { foo: 1, bar: 2, title: "Front matter", attr: true },
      }),
    );
  }
});

Deno.test("markdown()", async () => {
  const md = new Content(
    "# Heading 1\n\nFoo BAR baz.\n\n-----",
    "text/markdown",
    "en",
    null,
    { foo: 1, bar: 2 },
  );

  const def = markdown();
  await assertEquals$(
    def(md),
    md.replace({
      body: "<h1>Heading 1</h1>\n<p>Foo BAR baz.</p>\n<hr>\n",
      type: "text/html",
    }),
  );

  const xhtml = markdown(new MarkdownIt({ xhtmlOut: true }));
  await assertEquals$(
    xhtml(md),
    md.replace({
      body: "<h1>Heading 1</h1>\n<p>Foo BAR baz.</p>\n<hr />\n",
      type: "application/xhtml+xml",
    }),
  );

  const withAbbr = markdown(new MarkdownIt().use(abbr), {
    abbreviations: { ":BAR": "Bay Area Reporter" },
  });
  await assertEquals$(
    withAbbr(md),
    md.replace({
      body: '<h1>Heading 1</h1>\n<p>Foo <abbr title="Bay Area Reporter">' +
        "BAR</abbr> baz.</p>\n<hr>\n",
      type: "text/html",
      metadata: {
        ...await md.getMetadata(),
        abbreviations: { ":BAR": "Bay Area Reporter" },
      },
    }),
  );

  const withTitle = markdown(new MarkdownIt().use(title));
  await assertEquals$(
    withTitle(md),
    md.replace({
      body: "<h1>Heading 1</h1>\n<p>Foo BAR baz.</p>\n<hr>\n",
      type: "text/html",
      metadata: { ...await md.getMetadata(), title: "Heading 1" },
    }),
  );
});
