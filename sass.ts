/**
 * @copyright 2022 Hong Minhee
 * @license LGPL-3.0-only
 */
import { MediaType, MediaTypeError } from "./media_type.ts";
import { Content, ContentTransformer } from "./pipeline.ts";

export const CSS_MEDIA_TYPE = MediaType.fromString("text/css");
export const SASS_MEDIA_TYPE = MediaType.fromString("text/x-sass");
export const SCSS_MEDIA_TYPE = MediaType.fromString("text/x-scss");

/** Options for the Sass/SCSS compiler. */
export interface Options {
  /**
   * The output style of the compiled CSS.  Dart-Sass supports only "expanded"
   * and "compressed".
   */
  outputStyle?: "expanded" | "nested" | "compact" | "compressed";
  /**
   * The precision of the outputted numbers.  Dart-Sass does not support this.
   */
  precision?: number;
  /** Whether to embed the source map in the compiled CSS. */
  sourceMap?: boolean;
}

/**
 * Gives a {@link ContentTransformer} that compiles Sass/SCSS stylesheet to CSS.
 * @param options See {@link Options} for more information.
 * @returns A function that transforms a Sass/SCSS {@link Content} to a CSS
 *          {@link Content}.
 */
export function sass(options?: Options): ContentTransformer {
  const sassCompilerPromise = getSassCompiler();
  let sassCompiler: [SassCompilerType, string] | null | undefined;
  return (content: Content) => {
    if (content.type !== SASS_MEDIA_TYPE && content.type !== SCSS_MEDIA_TYPE) {
      throw new MediaTypeError(
        `Less only support ${SASS_MEDIA_TYPE} or ${SCSS_MEDIA_TYPE} ` +
          "as media type.",
      );
    }
    return content.replace({
      type: CSS_MEDIA_TYPE,
      body: async () => {
        const body = await content.getBody();
        const bodyBytes = body instanceof Uint8Array
          ? body
          : new TextEncoder().encode(body);
        if (typeof sassCompiler === "undefined") {
          sassCompiler = await sassCompilerPromise;
        }
        if (sassCompiler === null) {
          throw new Error(
            "Either sass (dart-sass) or sassc (SassC) command is needed, " +
              "but nothing is available.  See also:\n\n" +
              "https://github.com/sass/dart-sass \n" +
              "https://github.com/sass/sassc \n",
          );
        }
        const [type, path] = sassCompiler;
        const cmdOpts = getSassCompilerOptions(
          type,
          content.type === SASS_MEDIA_TYPE,
          options,
        );
        const proc = Deno.run({
          cmd: [path, ...cmdOpts],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        try {
          await proc.stdin.write(bodyBytes);
          proc.stdin.close();
          const stat = await proc.status();
          if (stat.success) {
            proc.stderr.close();
            const resultBytes = await proc.output();
            if (
              options != null && "asString" in options &&
              (options as { asString: boolean }).asString
            ) {
              return new TextDecoder().decode(resultBytes);
            }
            return resultBytes;
          }

          proc.stdout.close();
          const emsg = new TextDecoder().decode(await proc.stderrOutput());
          throw new Error(emsg);
        } finally {
          proc.close();
        }
      },
    });
  };
}

enum SassCompilerType {
  SassC,
  DartSass,
}

/**
 * Detects the type and the path of the available Sass compiler in the system.
 * @returns A pair of the type and the path of the available Sass compiler.
 *          If no compiler is installed, returns `null`.
 */
export async function getSassCompiler(): Promise<
  [SassCompilerType, string] | null
> {
  const dartSass = await checkCommand("sass");
  if (dartSass != null) return [SassCompilerType.DartSass, dartSass];
  const sassC = await checkCommand("sassc");
  if (sassC != null) return [SassCompilerType.SassC, sassC];
  return null;
}

async function checkCommand(command: string): Promise<string | null> {
  const proc = Deno.run({
    cmd: Deno.build.os == "windows"
      ? ["where", `${command}.exe`]
      : ["which", command],
    stdout: "piped",
    stderr: "null",
  });
  try {
    const stat = await proc.status();
    if (stat.success) {
      const result = await proc.output();
      const path = new TextDecoder().decode(result);
      return path.trimEnd();
    }
    proc.stdout.close();
    return null;
  } finally {
    proc.close();
  }
}

function getSassCompilerOptions(
  type: SassCompilerType,
  indentedSyntax: boolean,
  options?: Options,
): string[] {
  const outputStyle = options?.outputStyle ?? "expanded";
  if (
    type === SassCompilerType.DartSass &&
    outputStyle != "expanded" && outputStyle != "compressed"
  ) {
    throw new Error(
      'dart-sass only supports "expanded" and "compressed" for outputStyle.',
    );
  }
  const sourceMap = options?.sourceMap ?? false;
  if (type === SassCompilerType.DartSass && options?.precision != null) {
    throw new Error("precision is not configurable with dart-sass.");
  }
  const precision = options?.precision ?? 5;
  if (type === SassCompilerType.DartSass) {
    return [
      "--stdin",
      `--style=${outputStyle}`,
      "--stop-on-error",
      indentedSyntax ? "--indented" : "--no-indented",
      ...(sourceMap
        ? ["--source-map", "--embed-source-map"]
        : ["--no-source-map"]),
    ];
  }
  return [
    "--stdin",
    `--style=${outputStyle}`,
    `--precision=${precision}`,
    ...(indentedSyntax ? ["--sass"] : []),
    ...(sourceMap ? ["--sourcemap=inline"] : []),
  ];
}

export default sass;
