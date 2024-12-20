/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import { expandGlob, type ExpandGlobOptions } from "@std/fs/expand-glob";
import * as log from "@std/log";
import {
  basename,
  dirname,
  fromFileUrl,
  globToRegExp,
  isAbsolute,
  isGlob,
  join,
  resolve,
  SEPARATOR,
  SEPARATOR_PATTERN,
  toFileUrl,
} from "@std/path";
import { MediaType, MediaTypeError } from "./media_type.ts";
import { defaultMime, type Mime } from "./mime.ts";
import { intoMultiView } from "./multiview.ts";
import { rebase as rebaseUrl } from "./path.ts";
import {
  Content,
  type PathTransformer,
  Pipeline,
  Resource,
} from "./pipeline.ts";
import { ResourceError } from "./resource.ts";

function getLogger() {
  return log.getLogger("file");
}

/**
 * Creates a path transformer which replace the `base` of the given URL or
 * file path with a new base (`rebase`) with maintaining other parts.
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
  return rebaseUrl(
    relativePathToFileUrl(base),
    relativePathToFileUrl(rebase),
  );
}

/**
 * Similar to {@link toFileUrl} function, except that it takes relative paths
 * besides absolute paths.
 * @param path A file path to turn into a file URL.  If it is already
 *             a {@link URL} instance, it is returned without any change.
 * @returns A URL which corresponds to the given `path`.
 */
export function relativePathToFileUrl(path: string | URL): URL {
  if (typeof path == "string") {
    if (Deno.build.os !== "windows" || path.indexOf("\\") < 0) {
      try {
        return new URL(path);
      } catch (e) {
        if (!(e instanceof TypeError)) {
          throw e;
        }
      }
    }
    const url = toFileUrl(isAbsolute(path) ? path : resolve(path));
    if (
      path.charAt(path.length - 1).match(SEPARATOR_PATTERN) &&
      !url.pathname.endsWith("/")
    ) {
      url.pathname += "/";
    }
    return url;
  }
  return path;
}

async function* scanResources(
  globs: string[],
  options: ExpandGlobOptions & { encoding?: string },
  mime?: Mime,
): AsyncIterable<Resource> {
  const logger = getLogger();
  logger.debug(`Start scan: ${Deno.inspect(globs)}`);
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
      logger.debug(`Scan: ${path}`);
      yield new Resource(path, [content]);
    }
  }
}

/**
 * Options for {@link scanFiles} function.
 */
export interface ScanFilesOptions extends ExpandGlobOptions {
  /** Explicitly configure text encoding. */
  encoding?: string;
  /** An optional MIME object to recognize files' media types. */
  mime?: Mime;
}

/**
 * Scans files matched to the glob patterns, and returns a pipeline of scanned
 * files.  Each file is represented as a {@link Resource} with a single content.
 *
 * Note that the returned {@link Pipeline} monitors files (included non-existent
 * files to be created) that match the `globs` patterns.
 * @param globs The glob patterns to scan files.
 * @param options Options.  See also {@link ScanFilesOptions}.
 * @returns A pipeline of scanned files.
 */
export function scanFiles(
  globs: string[] | string,
  options?: ScanFilesOptions,
): Pipeline {
  const mime = options?.mime ?? defaultMime;
  const globArray = typeof globs == "string" ? [globs] : globs;
  const getResources = () => scanResources(globArray, options ?? {}, mime);
  const fixedDirs = globArray.map(getFixedDirFromGlob);
  const globPatterns = globArray.map((g) =>
    [isAbsolute(g), globToRegExp(g, options)] as [boolean, RegExp]
  );
  async function* watchFileChanges(): AsyncIterable<void> {
    const logger = getLogger();
    let cwd = Deno.cwd();
    if (!cwd.endsWith(SEPARATOR)) cwd += SEPARATOR;
    for await (const event of Deno.watchFs(fixedDirs, { recursive: true })) {
      if (event.kind == "access") continue;
      const matched = event.paths.some((p) =>
        globPatterns.some(([abs, re]) =>
          abs ? re.test(p) : p.startsWith(cwd) && re.test(p.substr(cwd.length))
        )
      );
      if (matched) {
        logger.info(`Detected file ${event.kind}.`);
        yield;
      }
    }
  }
  return new Pipeline(getResources, watchFileChanges());
}

function getFixedDirFromGlob(glob: string): string {
  let fixedDir = `.${SEPARATOR}`;
  for (const match of glob.matchAll(new RegExp(SEPARATOR_PATTERN, "g"))) {
    if (isGlob(glob.substr(0, match.index ?? 0))) break;
    fixedDir = glob.substr(0, (match.index ?? 0) + match[0].length);
  }
  return fixedDir;
}

/**
 * Options for {@link writeFiles} function.
 */
export interface WriteFilesOptions {
  /** An optional MIME object to determine file extensions from media types. */
  mime?: Mime;

  /**
   * Unless it's turned on, the output files are only written if the output
   * file is outdated.  Turned off by default.
   */
  rewriteAlways?: boolean;

  /**
   * A filename pattern of a sidecar file which is used to store
   * {@link Content#eTag}.  By default, `.*.etag` is used.
   * Ignored if `rewriteAlways` is turned on.
   */
  sidecarFilename?: (filename: string) => string;

  /**
   * An optional callback function to be called when a file is written.
   * It won't be called if the file is not written because it's up-to-date.
   * It won't be called for sidecar files either.
   * @param path The path of the file written.
   * @param content The metadata of the content to be written.
   * @param target The metadata of the existing file to be overwritten.
   * @returns A promise object to wait for the callback, or `void` if it's
   *          synchronous.
   */
  onWrite?: (
    path: URL,
    content: { lastModified: Date; eTag: string | null },
    target: { lastModified: Date | null; eTag: string | null } | null,
  ) => void | Promise<void>;
}

/**
 * Creates a function to take a resource and write its contents to files.
 *
 * Designed to work with {@link Pipeline#forEachWithReloading} and
 * {@link Pipeline#forEach} methods.
 * @param path The path of output directory to place made files.
 * @param base The base URL of the resource.  For example, if a resource URL
 *             is `https://example.com/foo/bar/baz.html` and `base` is
 *             configured to `https://example.com/foo/`, the file is written to
 *             `bar/baz.html` in the configured output directory (`path`).
 * @param options Additional options.
 * @returns A function to write the given resource's contents into files.
 */
export function writeFiles(
  path: string,
  base: string | URL,
  options?: WriteFilesOptions,
): (resource: Resource) => Promise<void> {
  const logger = getLogger();
  const mime = options?.mime ?? defaultMime;
  const rewriteAlways = options?.rewriteAlways ?? false;
  const sidecarFilename = options?.sidecarFilename ??
    ((f: string) => `.${f}.etag`);
  const pathUrl = relativePathToFileUrl(path);
  if (!pathUrl.pathname.endsWith("/")) {
    pathUrl.pathname += "/";
  }
  const rebasePath = rebase(base, pathUrl);

  function getSidecarPath(path: string | URL): string {
    if (path instanceof URL) path = fromFileUrl(path);
    return join(dirname(path), sidecarFilename(basename(path)));
  }

  async function loadSidecar(path: string | URL): Promise<string | null> {
    const sidecarPath = getSidecarPath(path);
    try {
      return await Deno.readTextFile(sidecarPath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return null;
      throw e;
    }
  }

  return async (resource: Resource) => {
    if (resource.size > 1) {
      throw new ResourceError(
        `${writeFiles.name}() cannot deal with resources that consist of ` +
          `multiple contents.  Try using ${intoMultiView.name}().\n` +
          `Resource path: ${resource.path}\nRepresentations:\n- ` +
          `${[...resource.keys()].map((k) => k.toString()).join("\n- ")}\n`,
      );
    }

    const content: Content = [...resource][0];
    let path = resource.path;
    if (path.pathname.endsWith("/")) {
      const ext = mime?.getExtension(content.type.toString());
      if (ext == null) {
        throw new MediaTypeError(
          "Failed to determine filename suffix for the media type " +
            content.type.toString() + ".",
        );
      }
      path = new URL(`./index.${ext}`, path);
    }
    const targetPath = rebasePath(path);
    let sidecar = null;
    let targetMtime;
    if (!rewriteAlways) {
      let targetStat: Deno.FileInfo | undefined;
      try {
        targetStat = await Deno.stat(targetPath);
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
      targetMtime = targetStat?.mtime;
      if (
        targetMtime != null &&
        targetMtime > content.lastModified &&
        (sidecar = await loadSidecar(targetPath)) === content.eTag
      ) {
        return;
      }
    }

    const contentBody = await content.getBody();
    const bodyBuffer = typeof contentBody == "string"
      ? new TextEncoder().encode(contentBody)
      : contentBody;
    await Deno.mkdir(dirname(fromFileUrl(targetPath)), { recursive: true });
    try {
      await Deno.writeFile(targetPath, bodyBuffer);
      if (options?.onWrite != null) {
        const p = options?.onWrite(
          targetPath,
          {
            lastModified: content.lastModified,
            eTag: content.eTag,
          },
          targetMtime == null && sidecar == null
            ? null
            : { lastModified: targetMtime ?? null, eTag: sidecar },
        );
        if (p instanceof Promise) await p;
      }
      logger.info(`Write: ${targetPath.toString()}`);
      if (!rewriteAlways) {
        if (content.eTag != null) {
          await Deno.writeTextFile(
            getSidecarPath(targetPath),
            content.eTag,
          );
        } else if (sidecar != null) {
          await Deno.remove(getSidecarPath(targetPath));
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        e.message += `: ${targetPath.toString()}`;
      }

      throw e;
    }
  };
}
