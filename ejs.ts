/**
 * @copyright 2021 Hong Minhee
 * @license LGPL-3.0-only
 */
import { dirname, resolve } from "https://deno.land/std@0.102.0/path/mod.ts";
import { compile } from "https://deno.land/x/dejs@0.9.3/mod.ts";
import { Content, LanguageTag, MediaType } from "./content.ts";
import * as metadata from "./metadata.ts";
import { ContentTransformer, Resource } from "./pipeline.ts";

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
 * @param context The contextual variables to be passed to the template.  These
 *                override any predefined variables if any are overlapped.
 * @param type The media type.
 * @returns A function that can be used to transform the content.
 * @throws {MediaTypeError} Thrown if the given `type` is not a valid IANA media
 *         type.
 */
export function renderTemplate(
  templateFile: string,
  context: Record<string, unknown> = {},
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
          tpl = await openTemplate(filePath);
        }
        return await tpl({
          ...await content.getMetadata(),
          content: content,
          body: await content.getBody(),
          metadata: await content.getMetadata(),
          __file__: filePath,
          __dir__: dirname(filePath),
          ...context,
        });
      },
      lastModified: tplMtime != null && tplMtime > content.lastModified
        ? tplMtime
        : content.lastModified,
    });
  };
}

/**
 * Renders a `list` of {@link Resource}s through an EJS template file and
 * returns a {@link Content} with the rendered content.
 *
 * In the EJS template, the following variables are available:
 *
 * - `list`: the array of {@link Resource}s
 * - `__file__`: the absolute path to the `templateFile`
 * - `__dir__`: the absolute path to the directory containing `templateFile`
 * - `query*`: the query functions defined in the *metadata.ts* module
 * - `sortResources`: a function that sorts the resources
 *
 * Other keys from `context` are also available as variables in the template,
 * and these keys can override the above variables.
 * @param templateFile The path to the template file.
 * @param list The list of {@link Resource}s to render.
 * @param context The contextual variables to be passed to the template.  These
 *                override any predefined variables if any are overlapped.
 * @param type The media type.
 * @param language The language tag.
 * @returns A {@link Content} with the rendered content.
 */
export async function renderListTemplate(
  templateFile: string,
  list: AsyncIterable<Resource> | Iterable<Resource>,
  context: Record<string, unknown> = {},
  type: MediaType | string = "text/html",
  language: LanguageTag | string | null = null,
): Promise<Content> {
  type = typeof type === "string" ? MediaType.fromString(type) : type;
  const filePath = resolve(templateFile);
  let lastModified = (await Deno.stat(filePath)).mtime ?? new Date(0);
  const array: Resource[] = [];
  for await (const resource of list) {
    array.push(resource);
    if (lastModified < resource.lastModified) {
      lastModified = resource.lastModified;
    }
  }

  return new Content(
    async () => {
      const tpl = await openTemplate(filePath);
      return await tpl({
        list: array,
        __file__: filePath,
        __dir__: dirname(filePath),
        ...metadata,
        ...context,
      });
    },
    type,
    language,
    lastModified,
    undefined,
    array.map((r) => r.path.toString()).join("\n"),
  );
}

/**
 * Opens a template file and returns a function that renders the template.
 * @param templateFile The path to the template file.
 * @returns A function that renders the template.
 */
async function openTemplate(
  templateFile: string,
): Promise<(params: Record<string, unknown>) => Promise<string>> {
  const filePath = resolve(templateFile);
  const f = await Deno.open(filePath, { read: true });
  try {
    return await compile(f);
  } finally {
    f.close();
  }
}
