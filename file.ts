import {
  dirname,
  fromFileUrl,
  isAbsolute,
  resolve,
  toFileUrl,
} from "https://deno.land/std@0.99.0/path/mod.ts";
import {
  expandGlob,
  ExpandGlobOptions,
} from "https://deno.land/std@0.99.0/fs/expand_glob.ts";
import {
  Mime,
  mime as defaultMime,
  MimeTypeMap,
} from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";
import { Content, PathTransformer, Pipeline, Resource } from "./pipeline.ts";

async function* scanResources(
  globs: string[],
  options: ExpandGlobOptions & { encoding?: string },
  mime?: Mime,
): AsyncIterable<Resource> {
  mime ??= defaultMime;
  const now = new Date();
  const paths = new Set<string>();
  for (const glob of globs) {
    for await (const f of expandGlob(glob, options)) {
      if (paths.has(f.path)) continue;
      paths.add(f.path);
      const path = new URL(`file://${f.path}`);
      const type = mime.getType(f.path);
      if (type == null) continue;
      let mediaType = MediaType.fromString(type);
      if (mediaType.parameters.charset == null && options.encoding != null) {
        mediaType = mediaType.withParameter("encoding", options.encoding);
      }
      const fileInfo = await Deno.stat(path);
      const content = new Content(
        () => Deno.readFile(path),
        mediaType,
        null,
        fileInfo.mtime || now,
      );
      yield new Resource(path, [content]);
    }
  }
}

/**
 * Scans files matched to the glob patterns, and returns a pipeline of scanned
 * files.  Each file is represented as a {@link Resource} with a single content.
 * @param globs The glob patterns to scan files.
 * @param options Optional glob options and encoding option.
 * @param mime An optional MIME object to recognize files' media types.
 * @returns A pipeline of scanned files.
 */
export function scanFiles(
  globs: string[] | string,
  options?: ExpandGlobOptions & { encoding?: string },
  mime?: Mime,
): Pipeline {
  globs = typeof globs == "string" ? [globs] : globs;
  const resources = scanResources(globs, options ?? {}, mime);
  return new Pipeline(resources);
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

function isBasedOn(url: URL, base: URL): boolean {
  return url.origin === base.origin && url.username === base.username &&
    url.password === base.password &&
    url.pathname.startsWith(
      base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`,
    );
}

/**
 * Creates a function to take a resource and write its contents to files.
 *
 * Designed to work with {@link Pipeline#forEach} method.
 * @param path The path of output directory to place made files.
 * @param base The base URL of the resource.  For example, if a resource URL
 *             is `https://example.com/foo/bar/baz.html` and `base` is
 *             configured to `https://example.com/foo/`, the file is written to
 *             `bar/baz.html` in the configured output directory (`path`).
 * @param mime An optional MIME object to determine file extensions from
 *             media types.
 * @returns A function to write the given resource's contents into files.
 */
export function writeFiles(
  path: string,
  base: string | URL,
  mime?: Mime,
): ((resource: Resource) => Promise<void>) {
  mime ??= defaultMime;
  const pathUrl = toFileUrl(path);
  if (!pathUrl.pathname.endsWith("/")) {
    pathUrl.pathname += "/";
  }
  const rebasePath = rebase(base, pathUrl);
  return async (resource: Resource) => {
    const representations = [...resource];
    const promises = representations.map(async (content) => {
      const ext = mime?.getExtension(content.type.toString());
      if (ext == null) {
        throw new MediaTypeError(
          "Failed to determine filename suffix for the media type " +
            content.type.toString() + ".",
        );
      }
      const path = resource.path;
      const pathType = mime?.getType(path.pathname);
      const bareName = path.pathname.replace(/\.[^.]+$/, "");
      const contentPath = path.pathname.endsWith("/")
        ? new URL(`./index.${ext}`, path)
        : pathType != null && content.type.matches(pathType)
        ? path
        : new URL(`${bareName}.${ext}${path.search}${path.hash}`, path);
      const targetPath = rebasePath(contentPath);
      const contentBody = await content.getBody();
      const bodyBuffer = typeof contentBody == "string"
        ? new TextEncoder().encode(contentBody)
        : contentBody;
      await Deno.mkdir(dirname(fromFileUrl(targetPath)), { recursive: true });
      try {
        await Deno.writeFile(targetPath, bodyBuffer);
      } catch (e) {
        if (e instanceof Error) {
          e.message += `: ${targetPath.toString()}`;
        }

        throw e;
      }
    });
    await Promise.all(promises);
  };
}

/**
 * Extends a given `mime` object with given `typeMaps`.
 * @param mime A base {@link Mime} instance to extend.
 * @param typeMaps Additional type maps.
 * @returns A distinct {@link Mime} instance with extended types.
 */
export function extendMime(mime: Mime, ...typeMaps: MimeTypeMap[]): Mime {
  const mimeTypes: MimeTypeMap = {};
  mime.types.forEach((type, ext) => {
    if (type in mimeTypes) mimeTypes[type].push(ext);
    else mimeTypes[type] = [ext];
  });

  return new Mime(mimeTypes, ...typeMaps);
}

export { defaultMime, Mime };
