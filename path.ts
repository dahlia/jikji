import {
  isAbsolute,
  resolve,
  toFileUrl,
} from "https://deno.land/std@0.99.0/path/mod.ts";
import { PathTransformer } from "./pipeline.ts";

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

function relativePathToFileUrl(path: string | URL) {
  if (typeof path == "string") {
    try {
      return new URL(path);
    } catch (e) {
      if (e instanceof TypeError) {
        return toFileUrl(isAbsolute(path) ? path : resolve(path));
      } else {
        throw e;
      }
    }
  }
  return path;
}

/**
 * Checks if the given `url` is based on the given `base` URL.
 * @param url The url to check.
 * @param base The base URL.  Its `pathname` has to end with a slash.
 * @returns `true` iff the given `url is based on the given `base` URL.
 */
export function isBasedOn(url: URL, base: URL): boolean {
  if (!base.pathname.endsWith("/")) {
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