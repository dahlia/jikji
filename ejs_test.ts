import { join } from "https://deno.land/std@0.102.0/path/mod.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.102.0/testing/asserts.ts";
import { Content, LanguageTag, MediaType } from "./content.ts";
import { renderListTemplate, renderTemplate } from "./ejs.ts";
import { makeResources, withTempDir } from "./fixtures.ts";
import { queryTitle, sortResources } from "./metadata.ts";

Deno.test("renderTemplate()", () =>
  withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(path: string) {
      const tpl = join(path, "template.ejs");
      await Deno.writeTextFile(
        tpl,
        "<h1><%= metadata.title %></h1><p><%- body %></p><p>" +
          "<%= __file__ %><br><%= __dir__ %></p>",
      );
      const transformer = renderTemplate(tpl);
      const ds = [new Date(0), new Date(new Date().getTime() + 10000000)];
      for (const d of ds) {
        const content = new Content("Content body", "text/plain", "en", d, {
          title: "Content title",
        });
        const transformed = transformer(content);
        assertEquals(transformed.type, MediaType.fromString("text/html"));
        assertEquals(transformed.language, LanguageTag.fromString("en"));
        if (d.getTime() < 1) {
          assert(d < transformed.lastModified);
        } else {
          assertEquals(transformed.lastModified, d);
        }
        assertEquals(
          await transformed.getBody(),
          `<h1>Content title</h1><p>Content body</p><p>${tpl}<br>${path}</p>`,
        );
        assertEquals(
          await transformed.getMetadata(),
          { title: "Content title" },
        );
      }
    },
  }));

Deno.test("renderListTemplate()", () =>
  withTempDir({
    prefix: "jikji-t-",
    suffix: "-fx",
    async fn(path: string) {
      const tpl = join(path, "template.ejs");
      const tplBody =
        "<h1><%= heading %></h1><ul><% for (const r of list) { %>" +
        "<li><%= await queryTitle(r) %>" +
        "<% } %></ul>";
      await Deno.writeTextFile(tpl, tplBody);
      const resources = makeResources({
        "foo.txt": ["a", { title: "A" }],
        "bar.txt": ["b", { title: "B" }],
        "baz.txt": ["c", { title: "C" }],
        "qux.txt": ["d", { title: "D" }],
      });
      const content = await renderListTemplate(
        tpl,
        resources,
        { heading: "Title" },
        "text/html",
        "en",
      );
      assertEquals(
        "<h1>Title</h1><ul><li>B<li>C<li>A<li>D</ul>",
        await content.getBody(),
      );
      assertEquals(content.type, MediaType.fromString("text/html"));
      assertEquals(content.language, LanguageTag.fromString("en"));

      const content2 = await renderListTemplate(
        tpl,
        await sortResources(resources, queryTitle),
        { heading: "Title" },
        "text/html",
        "en-US",
      );
      assertEquals(
        "<h1>Title</h1><ul><li>A<li>B<li>C<li>D</ul>",
        await content2.getBody(),
      );
      assertEquals(content2.type, MediaType.fromString("text/html"));
      assertEquals(content2.language, LanguageTag.fromString("en-US"));
      assertEquals(content.lastModified, content2.lastModified);
      assertNotEquals(content.extraFingerprint, content2.extraFingerprint);

      await Deno.writeTextFile(tpl, tplBody);
      const content3 = await renderListTemplate(
        tpl,
        resources,
        { heading: "Title" },
        "text/html",
        "en",
      );
      assertEquals(await content3.getBody(), await content.getBody());
      assert(content3.lastModified > content.lastModified);
    },
  }));
