/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import * as yaml from "@std/yaml";
import MarkdownIt from "markdown-it";
import abbr from "markdown-it-abbr";
import attrs from "markdown-it-attrs";
import bracketedSpans from "markdown-it-bracketed-spans";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import title from "markdown-it-title";
import { Content, type ContentTransformer, MediaType } from "./pipeline.ts";

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
export function frontMatter(content: Content): Content {
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
