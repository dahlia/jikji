/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import { compileStringAsync } from "sass";
import { MediaType, MediaTypeError } from "./media_type.ts";
import type { Content, ContentTransformer } from "./pipeline.ts";

export const CSS_MEDIA_TYPE: MediaType = MediaType.fromString("text/css");
export const SCSS_MEDIA_TYPE: MediaType = MediaType.fromString("text/x-scss");

export const REQUIRED_PERMISSIONS: Deno.PermissionOptionsObject = {
  net: ["deno.land"],
};

/** Options for the Sass/SCSS compiler. */
export interface Options {
  /**
   * The output style of the compiled CSS.
   */
  outputStyle?: "expanded" | "compressed";
}

/**
 * Gives a {@link ContentTransformer} that compiles Sass/SCSS stylesheet to CSS.
 * @param options See {@link Options} for more information.
 * @returns A function that transforms a Sass/SCSS {@link Content} to a CSS
 *          {@link Content}.
 */
export function sass(options?: Options): ContentTransformer {
  return (content: Content) => {
    if (content.type.matches("text/x-sass")) {
      throw new MediaTypeError(
        `Indented syntax of Sass (text/x-sass) is no more supported.  ` +
          `Use the curly-bracket syntax of SCSS (${SCSS_MEDIA_TYPE}) instead.`,
      );
    } else if (content.type !== SCSS_MEDIA_TYPE) {
      throw new MediaTypeError(
        `Only support media type ${SCSS_MEDIA_TYPE}.`,
      );
    }
    return content.replace({
      type: CSS_MEDIA_TYPE,
      body: async () => {
        const body = await content.getBody();
        const bodyBytes = typeof body === "string"
          ? body
          : new TextDecoder().decode(body);
        const sass = await compileStringAsync(bodyBytes, {
          style: options?.outputStyle,
          loadPaths: [],
        });
        if (
          options != null && "asString" in options &&
          (options as { asString: boolean }).asString
        ) {
          return sass.css;
        }
        return new TextEncoder().encode(sass.css);
      },
    });
  };
}

export default sass;
