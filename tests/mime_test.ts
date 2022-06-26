import { assertEquals } from "https://deno.land/std@0.145.0/testing/asserts.ts";
import { extendMime, Mime } from "../mime.ts";

Deno.test("extendMime()", () => {
  const base = new Mime({
    "text/plain": ["txt"],
    "text/html": ["html", "htm"],
  });
  const extended = extendMime(base);
  base.define({ "image/png": ["png"] });
  extended.define({ "text/markdown": ["md", "markdown"] });
  assertEquals(base.getExtension("text/plain"), "txt");
  assertEquals(extended.getExtension("text/plain"), "txt");
  assertEquals(base.getExtension("text/html"), "html");
  assertEquals(extended.getExtension("text/html"), "html");
  assertEquals(base.getExtension("image/png"), "png");
  assertEquals(extended.getExtension("image/png"), undefined);
  assertEquals(base.getExtension("text/markdown"), undefined);
  assertEquals(extended.getExtension("text/markdown"), "md");
});
