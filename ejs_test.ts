import { join } from "https://deno.land/std@0.100.0/path/mod.ts";
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.100.0/testing/asserts.ts";
import { Content, LanguageTag, MediaType } from "./content.ts";
import { renderTemplate } from "./ejs.ts";
import { withTempDir } from "./fixtures.ts";

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
      const tplMtime = (await Deno.stat(path)).mtime;
      assertNotEquals(tplMtime, null);
      const transformer = renderTemplate(tpl);
      for (const d of [new Date(0), new Date(tplMtime!.getTime() + 1000000)]) {
        const content = new Content("Content body", "text/plain", "en", d, {
          title: "Content title",
        });
        const transformed = transformer(content);
        assertEquals(transformed.type, MediaType.fromString("text/html"));
        assertEquals(transformed.language, LanguageTag.fromString("en"));
        assertEquals(transformed.lastModified, d.getTime() < 1 ? tplMtime : d);
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
