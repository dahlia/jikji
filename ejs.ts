import { dirname, resolve } from "https://deno.land/std@0.101.0/path/mod.ts";
import { compile } from "https://deno.land/x/dejs@0.9.3/mod.ts";
import { Content, MediaType } from "./content.ts";
import { ContentTransformer } from "./pipeline.ts";

/**
 * Gives a {@link ContentTransformer} that compiles and renders EJS templates.
 *
 * In the EJS template, the following variables are available:
 *
 * - `content`: the current {@link Content} object
 * - `body`: the current {@link Content}'s body
 * - `metadata`: the current {@link Content}'s metadata
 * - `__file__`: the absolute path to the `templateFile`
 * - `__dir__`: the absolute path to the directory containing `templateFile`
 *
 * Other metadata keys also are available as variables in the template,
 * unless they are not overlapped with the above.
 *
 * Designed to be used with {@link Pipeline#transform} and
 * {@link Pipeline#diversify} methods.
 * @param templateFile The path to the template file.
 * @param type The media type.
 * @returns A function that can be used to transform the content.
 * @throws {MediaTypeError} Thrown if the given `type` is not a valid IANA media
 *         type.
 */
export function renderTemplate(
  templateFile: string,
  type: MediaType | string = "text/html",
): ContentTransformer {
  type = typeof type === "string" ? MediaType.fromString(type) : type;
  let tpl: ((params: Record<string, unknown>) => Promise<string>) | undefined;
  const filePath = resolve(templateFile);
  const tplMtime = Deno.statSync(filePath).mtime;
  return (content: Content) => {
    return content.replace({
      type: type,
      body: async () => {
        if (tpl == null) {
          const f = await Deno.open(filePath, { read: true });
          try {
            tpl = await compile(f);
          } finally {
            f.close();
          }
        }
        return await tpl({
          ...await content.getMetadata(),
          content: content,
          body: await content.getBody(),
          metadata: await content.getMetadata(),
          __file__: filePath,
          __dir__: dirname(filePath),
        });
      },
      lastModified: tplMtime != null && tplMtime > content.lastModified
        ? tplMtime
        : content.lastModified,
    });
  };
}
