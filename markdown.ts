/**
 * @copyright 2021–2023 Hong Minhee
 * @license LGPL-3.0-only
 */
import MarkdownIt from "npm:markdown-it@13.0.1";
import abbr from "npm:markdown-it-abbr@1.0.4";
import attrs from "npm:markdown-it-attrs@4.1.4";
import bracketedSpans from "npm:markdown-it-bracketed-spans@1.0.1";
import deflist from "npm:markdown-it-deflist@2.1.0";
import footnote from "npm:markdown-it-footnote@3.0.3";
import title from "npm:markdown-it-title@4.0.0";
import * as yaml from "https://deno.land/std@0.206.0/yaml/mod.ts";
import { Content, ContentTransformer, MediaType } from "./pipeline.ts";

/**
 * Parses front matter in the given {@link Content} (if exists) and turn it
 * into metadata.  Overlapped metadata keys are overwritten.
 * Parsed front matter is removed from body.  If the body is a
 * {@link Uint8Array}, it is decoded into a string.
 *
 * Designed to work with {@link Pipeline#transform} or
 * {@link Pipeline#diversify} methods.
 * @param content The content to parse its front matter.
 * @returns The distinct content with front matter turned to metadata.
 */
export function frontMatter(content: Content) {
  const frontMatterPattern = /^\ufeff?---\r?\n((.+?\r?\n)*?)---\r?\n/;
  const charset = content.type.parameters.charset;
  return new Content(
    async () => {
      const metadata = await content.getMetadata();
      let src = await content.getBody();
      if (src instanceof Uint8Array) {
        const decoder = new TextDecoder(charset || "utf-8");
        src = decoder.decode(src);
      }
      const match = frontMatterPattern.exec(src);
      if (match != null && match[1] != null) {
        const frontMatter = yaml.parse(match[1]);
        const newMetadata = typeof frontMatter == "object"
          ? { ...metadata, ...frontMatter }
          : { ...metadata, frontMatter };
        return [src.slice(match[0].length), newMetadata];
      }
      return [await content.getBody(), metadata];
    },
    MediaType.get("text", "markdown", [], charset == null ? {} : { charset }),
    content.language,
    content.lastModified,
  );
}

/**
 * Creates a content transformer which compiles a Markdown into an HTML/XHTML.
 * The used `env`ironment sandbox is merged to content metadata.  If some
 * metadata keys are overlapped, the existing keys are overwritten.  If the body
 * is a {@link Uint8Array}, it is decoded into a string.
 *
 * Designed to work with {@link Pipeline#transform} or
 * {@link Pipeline#diversify} methods.
 * @param markdownIt An optional instance of {@link MarkdownIt}.  If omitted,
 *                   a new instance with default settings is used.
 * @param env An optional environment sandbox.
 * @returns A function to compiles a Markdown into an HTML/XHTML.
 */
export function markdown(
  markdownIt?: typeof MarkdownIt,
  env?: Record<string, unknown>,
): ContentTransformer {
  markdownIt ??= new MarkdownIt();
  const outType = markdownIt.options.xhtmlOut
    ? MediaType.fromString("application/xhtml+xml")
    : MediaType.fromString("text/html");
  return (content) => {
    const charset = content.type.parameters.charset;
    return new Content(
      async () => {
        const metadata = await content.getMetadata();
        let src = await content.getBody();
        if (src instanceof Uint8Array) {
          const decoder = new TextDecoder(charset || "utf-8");
          src = decoder.decode(src);
        }
        const newEnv = { ...env };
        return [markdownIt!.render(src, newEnv), { ...metadata, ...newEnv }];
      },
      charset == null ? outType : outType.withParameter("charset", charset),
      content.language,
      content.lastModified,
    );
  };
}

export { abbr, attrs, bracketedSpans, deflist, footnote, MarkdownIt, title };
