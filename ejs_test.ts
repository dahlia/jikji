import { join } from "https://deno.land/std@0.99.0/path/mod.ts";
import { assertEquals } from "https://deno.land/std@0.99.0/testing/asserts.ts";
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
      const transformer = renderTemplate(tpl);
      const d = new Date();
      const content = new Content("Content body", "text/plain", "en", d, {
        title: "Content title",
      });
      const transformed = transformer(content);
      assertEquals(transformed.type, MediaType.fromString("text/html"));
      assertEquals(transformed.language, LanguageTag.fromString("en"));
      assertEquals(transformed.lastModified, d);
      assertEquals(
        await transformed.getBody(),
        `<h1>Content title</h1><p>Content body</p><p>${tpl}<br>${path}</p>`,
      );
      assertEquals(await transformed.getMetadata(), { title: "Content title" });
    },
  }));
