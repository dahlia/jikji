/**
 * @copyright 2021 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  isAbsolute,
  resolve,
  toFileUrl,
} from "https://deno.land/std@0.102.0/path/mod.ts";
import { PathTransformer, Resource } from "./pipeline.ts";

/**
 * An identity {@link PathTransformer} that does nothing.
 * @param path The path (not) to transform.
 * @returns The given `path` as-is.
 */
export function identity(path: URL) {
  return path;
}

/**
 * Represents functions to determine if a given `path` meets a certain criteria.
 * @param path The path to check.
 * @returns `true` if the `path` meets the criteria, `false` otherwise.
 */
export type PathPredicate = (path: URL) => boolean;

/**
 * Creates a conditional {@link PathTransformer} that applies a given
 * `trueTransformer` if the `predicate` returns `true`, and a given
 * `falseTransformer` otherwise.
 * @param predicate A predicate function that determines whether a given
 *                  `trueTransformer` should be applied.
 * @param trueTransformer A {@link PathTransformer} to apply if `predicate`
 *                        returns `true`.
 * @param falseTransformer A {@link PathTransformer} to apply if `predicate`
 *                         returns `false`.
 *                         By default, this is an {@link identity} transformer.
 */
export function when(
  predicate: PathPredicate,
  trueTransformer: PathTransformer,
  falseTransformer: PathTransformer = identity,
): PathTransformer {
  return (path: URL) =>
    predicate(path) ? trueTransformer(path) : falseTransformer(path);
}

/**
 * Creates a {@link PathPredicate} that returns `true` iff the given `path` does
 * not end with a slash and its basename has one of the given `extensions`.
 * @param extensions Extensions to check.  The first period (.) can be omitted.
 * @returns A {@link PathPredicate} to check if the file that `path` points to
 *          has one of the given `extensions`.
 */
export function havingExtension(...extensions: string[]): PathPredicate {
  const suffixes = extensions.map((ext) =>
    ext.startsWith(".") ? ext : `.${ext}`
  );
  return (path: URL) => {
    if (path.pathname.endsWith("/")) return false;
    const suffix = path.pathname.substr(path.pathname.lastIndexOf("."));
    return suffixes.includes(suffix);
  };
}

/**
 * Creates a {@link PathTransformer} that replace a given `pattern` with a
 * given `replacement` in a given `path`'s basename.
 * @param pattern The pattern to replace.  This can be a string or a regular
 *                expression.
 * @param replacement The string to replace the `pattern` with.
 *                    This can contain backreferences like `$1`, `$2`, etc to
 *                    the captured groups of the `pattern` (if it is a regular
 *                    expression).
 * @returns A {@link PathTransformer} that replaces the `pattern` with the
 *          `replacement` in the basename of the `path`.
 */
export function replaceBasename(
  pattern: RegExp | string,
  replacement: string,
): PathTransformer {
  return (path: URL): URL => {
    if (path.pathname.endsWith("/")) return path;
    const offset = path.pathname.lastIndexOf("/");
    const result = new URL(path.toString());
    const basename = path.pathname.substr(offset + 1);
    result.pathname = path.pathname.substr(0, offset) + "/" +
      basename.replace(pattern, replacement);
    return result;
  };
}

/**
 * Create a path transformer which appends a slash to the given path
 * if it does not end with a slash.
 *
 * Designed to work with {@link Pipeline#move} method.
 * @param stripExtension Whether to remove the extension from the existing
 *                       basename if it has one.  Turned on by default.
 * @returns A function to appends a slash to the given path if it does not end
 * with a slash.
 */
export function intoDirectory(stripExtension = true): PathTransformer {
  const ext = stripExtension ? /(\.[^./]+|\/)?$/ : /\/?$/;
  return (url: URL): URL =>
    new URL(
      url.pathname.replace(ext, "/") + url.search + url.hash,
      url,
    );
}

/**
 * Creates a path transformer which replace the `base` of the given URL with
 * a new base (`rebase`) with maintaining other parts.
 *
 * Designed to work with {@link Pipeline#move} method.
 * @param base The base URL to be replaced.  This must end with a slash and
 *             does not have any query string (`search`) or fragment (`hash`).
 * @param rebase The URL to replace the `base` of the given URL.  This must
 *               end with a slash and does not have any query string (`search`)
 *               or fragment (`hash`).
 * @returns A function to replace the `base` of the given URL with a new
 *          base (`rebase`).
 * @throws {TypeError} Thrown when the given `base`/`rebase` URL has search
 *                     (query string) or hash (anchor), or its path does not
 *                     end with a slash.
 */
export function rebase(
  base: string | URL,
  rebase: string | URL,
): PathTransformer {
  const baseUrl = relativePathToFileUrl(base);
  if (baseUrl.search !== "" || baseUrl.hash !== "") {
    throw new TypeError(
      `The base URL must not have search (query string) or hash (anchor): ${
        JSON.stringify(baseUrl.toString())
      }.`,
    );
  } else if (!baseUrl.pathname.endsWith("/")) {
    throw new TypeError(
      `The base path/URL's path must end with a slash (/): ${
        JSON.stringify(baseUrl.toString())
      }.`,
    );
  }
  const rebaseUrl = relativePathToFileUrl(rebase);
  if (rebaseUrl.search !== "" || rebaseUrl.hash !== "") {
    throw new TypeError(
      `The rebase URL must not have search (query string) or hash (anchor): ${
        JSON.stringify(rebaseUrl.toString())
      }.`,
    );
  } else if (!rebaseUrl.pathname.endsWith("/")) {
    throw new TypeError(
      `The rebase path/URL's path must end with a slash (/): ${
        JSON.stringify(rebaseUrl.toString())
      }.`,
    );
  }
  return (path: URL) => {
    if (!isBasedOn(path, baseUrl)) return path;
    const pathname = path.pathname.substr(baseUrl.pathname.length) +
      path.search + path.hash;
    return new URL(pathname, rebaseUrl);
  };
}

/**
 * Similar to {@link toFileUrl} function, except that it takes relative paths
 * besides absolute paths.
 * @param path A file path to turn into a file URL.  If it is already
 *             a {@link URL} instance, it is returned without any change.
 * @returns A URL which corresponds to the given `path`.
 */
export function relativePathToFileUrl(path: string | URL) {
  if (typeof path == "string") {
    try {
      return new URL(path);
    } catch (e) {
      if (e instanceof TypeError) {
        return toFileUrl(
          isAbsolute(path)
            ? path
            : resolve(path) + (path.endsWith("/") ? "/" : ""),
        );
      } else {
        throw e;
      }
    }
  }
  return path;
}

/**
 * Checks if the given `url` is based on the given `base` URL.
 * @param url The URL to check.
 * @param base The base URL.  Its `pathname` has to end with a slash.
 * @returns `true` iff the given `url is based on the given `base` URL.
 * @throws {TypeError} Thrown when the given `base` URL has search
 *                     (query string) or hash (anchor), or its path does not
 *                     end with a slash.
 */
export function isBasedOn(url: URL, base: URL): boolean {
  if (base.search !== "" || base.hash !== "") {
    throw new TypeError(
      `The base URL must not have search (query string) or hash (anchor): ${
        JSON.stringify(base.toString())
      }.`,
    );
  } else if (!base.pathname.endsWith("/")) {
    throw new TypeError(
      `The base URL must end with a slash (/): ${
        JSON.stringify(base.toString())
      }.`,
    );
  }
  return url.origin === base.origin && url.username === base.username &&
    url.password === base.password &&
    url.pathname.startsWith(base.pathname);
}

/**
 * Removes the given `base` from the given `url`, and returns a relative path.
 * @param url The URL to remove its `base`.
 * @param base The base to be removed from the given `url`.
 * @returns The path (with query string and anchor if exist) to the given `url`
 *          relative to the `base` URL.
 * @throws {TypeError} Thrown when the given `base` URL has search
 *                     (query string) or hash (anchor), or its path does not
 *                     end with a slash.
 * @throws {TypeError} Thrown when the given `url` is not based on the given
 *                     `base` URL.
 */
export function removeBase(url: URL, base: URL): string {
  if (!isBasedOn(url, base)) {
    throw new TypeError(
      `${JSON.stringify(url.toString())} is not based on ${
        JSON.stringify(base.toString())
      }.`,
    );
  }

  return url.pathname.substr(base.pathname.length) + url.search + url.hash;
}

/**
 * Checks if the given `url` matches to the `pattern`, and extracts a matched
 * string from it.
 * @param url The URL to try to match.
 * @param pattern The pattern to search.
 * @param options Options.  If `options.base` is present, the `base` is removed
 *                from the given `url` and the `pattern` is matched to it.
 * @returns The whole matched string if the `url` matches to the `pattern`.
 *          `null` if it does not match.
 * @throws {TypeError} Thrown if `options.base` is present and it does not end
 *         with a slash or the given `url` is not based on it.
 */
export function extractFromUrl(
  url: URL,
  pattern: RegExp,
  options?: { base: URL },
): string | null;

/**
 * Checks if the given `url` matches to the `pattern`, and extracts a matched
 * string from it.
 * @param url The URL to try to match.
 * @param pattern The pattern to search.
 * @param options Options.  If `options.base` is present, the `base` is removed
 *                from the given `url` and the `pattern` is matched to it.
 *                If `options.convert` is present, a match result is converted
 *                (even if a match result is `null`) and returns the converted
 *                value.
 * @returns The converted match result if the `url` matches to the `pattern`.
 * @throws {TypeError} Thrown if `options.base` is present and it does not end
 *         with a slash or the given `url` is not based on it.
 */
export function extractFromUrl<T>(
  url: URL,
  pattern: RegExp,
  options: { base?: URL; convert: (match: RegExpMatchArray | null) => T },
): T;

export function extractFromUrl<T>(
  url: URL,
  pattern: RegExp,
  options?: { base: URL } | {
    base?: URL;
    convert: (match: RegExpMatchArray | null) => T;
  },
): string | null | T {
  const path: string = options?.base != null
    ? removeBase(url, options.base)
    : url.toString();
  const match: RegExpExecArray | null = pattern.exec(path);
  if (options != null && "convert" in options && options.convert != null) {
    return options?.convert(match);
  }
  return match && match[0];
}

/**
 * Checks if given `resource`'s path matches to the `pattern`, and extracts
 * a matched string from it.
 *
 * Works well with {@link Pipeline#groupBy} method.
 * @param resource The resource to try to match its path.
 * @param pattern The pattern to search.
 * @param options Options.  If `options.base` is present, the `base` is removed
 *                from given `resource`'s path and the `pattern` is matched
 *                to it.
 * @returns The whole matched string if the `resource`'s path matches to
 *          the `pattern`.  `null` if it does not match.
 * @throws {TypeError} Thrown if `options.base` is present and it does not end
 *         with a slash or given `resource`'s path is not based on it.
 */
export function extractFromPath(
  resource: Resource,
  pattern: RegExp,
  options?: { base: URL },
): string;

/**
 * Checks if given `resource`'s path matches to the `pattern`, and extracts
 * a matched string from it.
 *
 * Works well with {@link Pipeline#groupBy} method.
 * @param resource The resource to try to match its path.
 * @param pattern The pattern to search.
 * @param options Options.  If `options.base` is present, the `base` is removed
 *                from given `resource`'s path and the `pattern` is matched
 *                to it.  If `options.convert` is present, a match result is
 *                converted (even if a match result is `null`) and returns
 *                the converted value.
 * @returns The converted match result if `resource`'s path matches to
 *          the `pattern`.
 * @throws {TypeError} Thrown if `options.base` is present and it does not end
 *         with a slash or given `resource`'s path is not based on it.
 */
export function extractFromPath<T>(
  resource: Resource,
  pattern: RegExp,
  options: { base?: URL; convert: (match: RegExpMatchArray | null) => T },
): T;

export function extractFromPath<T>(
  resource: Resource,
  pattern: RegExp,
  options?: { base: URL } | {
    base?: URL;
    convert: (match: RegExpMatchArray | null) => T;
  },
): string | null | T {
  const path = resource.path;

  if (options != null && "convert" in options && options.convert != null) {
    return extractFromUrl(path, pattern, options);
  } else if (options == null || options?.base == null) {
    return extractFromUrl(path, pattern);
  } else {
    return extractFromUrl(path, pattern, { base: options.base });
  }
}
