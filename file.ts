import { dirname, fromFileUrl } from "https://deno.land/std@0.99.0/path/mod.ts";
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
import { rebase, relativePathToFileUrl } from "./path.ts";
import { Content, Pipeline, Resource } from "./pipeline.ts";

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
  const pathUrl = relativePathToFileUrl(path);
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
