/**
 * @copyright 2021–2023 Hong Minhee
 * @license LGPL-3.0-only
 */
import { delay } from "https://deno.land/std@0.190.0/async/mod.ts";
import { join } from "https://deno.land/std@0.190.0/path/mod.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { makeResources, tempDirPermissions, withTempDir } from "./fixtures.ts";
import { Content, LanguageTag, MediaType } from "../content.ts";
import { renderListTemplate, renderTemplate } from "../ejs.ts";
import { queryTitle, sortResources } from "../metadata.ts";

Deno.test({
  name: "renderTemplate()",
  permissions: tempDirPermissions,
  fn: () =>
    withTempDir({
      prefix: "jikji-t-",
      suffix: "-fx",
      async fn(path: string) {
        const tpl = join(path, "template.ejs");
        await Deno.writeTextFile(
          tpl,
          "<h1><%= metadata.title %></h1><p><%- body %></p><p>" +
            "<%= __file__ %><br><%= __dir__ %><br><%= foo %></p>",
        );
        const transformer = renderTemplate(tpl, { foo: "bar" });
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
            "<h1>Content title</h1><p>Content body</p><p>" +
              `${tpl}<br>${path}<br>bar</p>`,
          );
          assertEquals(
            await transformed.getMetadata(),
            { title: "Content title" },
          );
        }
      },
    }),
});

Deno.test({
  name: "renderListTemplate()",
  permissions: tempDirPermissions,
  fn: () =>
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
        assertNotEquals(content.eTag, content2.eTag);

        await delay(1000);
        await Deno.writeTextFile(tpl, tplBody);
        const content3 = await renderListTemplate(
          tpl,
          resources,
          { heading: "Title" },
          "text/html",
          "en",
        );
        assertEquals(await content3.getBody(), await content.getBody());
        assert(
          content3.lastModified > content.lastModified,
          `content3.lastModified (${content3.lastModified}) > ` +
            `content.lastModified (${content.lastModified})`,
        );
      },
    }),
});
