import {
  basename,
  dirname,
  fromFileUrl,
  globToRegExp,
  isAbsolute,
  isGlob,
  join,
  sep,
  SEP_PATTERN,
} from "https://deno.land/std@0.102.0/path/mod.ts";
import {
  expandGlob,
  ExpandGlobOptions,
} from "https://deno.land/std@0.102.0/fs/expand_glob.ts";
import * as log from "https://deno.land/std@0.102.0/log/mod.ts";
import {
  Mime,
  mime,
  MimeTypeMap,
} from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";
import { rebase, relativePathToFileUrl } from "./path.ts";
import { Content, Pipeline, Resource } from "./pipeline.ts";

function getLogger() {
  return log.getLogger("file");
}

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
 *
 * Note that the returned {@link Pipeline} monitors files (included non-existent
 * files to be created) that match the `globs` patterns.
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
  const globArray = typeof globs == "string" ? [globs] : globs;
  const getResources = () => scanResources(globArray, options ?? {}, mime);
  const fixedDirs = globArray.map(getFixedDirFromGlob);
  const globPatterns = globArray.map((g) =>
    [isAbsolute(g), globToRegExp(g, options)] as [boolean, RegExp]
  );
  async function* watchFileChanges(): AsyncIterable<void> {
    const logger = getLogger();
    let cwd = Deno.cwd();
    if (!cwd.endsWith(sep)) cwd += sep;
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
  let fixedDir = `.${sep}`;
  for (const match of glob.matchAll(new RegExp(SEP_PATTERN, "g"))) {
    if (isGlob(glob.substr(0, match.index ?? 0))) break;
    fixedDir = glob.substr(0, (match.index ?? 0) + match[0].length);
  }
  return fixedDir;
}

/**
 * Options for {@link writeFiles} function.
 */
interface WriteFilesOptions {
  /** An optional MIME object to determine file extensions from media types. */
  mime?: Mime;

  /**
   * Unless it's turned on, the output files are only written if the output
   * file is outdated.  Turned off by default.
   */
  rewriteAlways?: boolean;

  /**
   * A filename pattern of a sidecar file which is used to store
   * {@link Content#extraFingerprint}.  By default, `.*.cache` is used.
   * Ignored if `rewriteAlways` is turned on.
   */
  sidecarFilename?: (filename: string) => string;
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
): ((resource: Resource) => Promise<void>) {
  const logger = getLogger();
  const mime = options?.mime ?? defaultMime;
  const rewriteAlways = options?.rewriteAlways ?? false;
  const sidecarFilename = options?.sidecarFilename ??
    ((f: string) => `.${f}.cache`);
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
    const representations = [...resource];
    const promises = representations.map(async (content) => {
      let ext = mime?.getExtension(content.type.toString());
      if (ext == null) {
        throw new MediaTypeError(
          "Failed to determine filename suffix for the media type " +
            content.type.toString() + ".",
        );
      }
      let lang = "";
      if (content.language != null) {
        lang = `${content.language.toString().toLowerCase()}.`;
        ext = `${lang}${ext}`;
      }
      const path = resource.path;
      const pathType = mime?.getType(path.pathname);
      const bareName = path.pathname.replace(/\.[^.]+$/, "");
      const contentPath = path.pathname.endsWith("/")
        ? new URL(`./index.${ext}`, path)
        : pathType != null && content.type.matches(pathType)
        ? new URL(
          `${bareName}.${lang}${
            path.pathname.match(/[^.]+$/)![0]
          }${path.search}${path.hash}`,
          path,
        )
        : new URL(`${bareName}.${ext}${path.search}${path.hash}`, path);
      const targetPath = rebasePath(contentPath);
      let sidecar = null;
      if (!rewriteAlways) {
        let targetStat: Deno.FileInfo | undefined;
        try {
          targetStat = await Deno.stat(targetPath);
        } catch (e) {
          if (!(e instanceof Deno.errors.NotFound)) throw e;
        }
        const targetMtime = targetStat?.mtime;
        if (
          targetMtime != null &&
          targetMtime > content.lastModified &&
          (sidecar = await loadSidecar(targetPath)) === content.extraFingerprint
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
        logger.info(targetPath.toString());
        if (!rewriteAlways) {
          if (content.extraFingerprint != null) {
            await Deno.writeTextFile(
              getSidecarPath(targetPath),
              content.extraFingerprint,
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

/**
 * Default {@link Mime} instance.
 */
const defaultMime = extendMime(mime);

export { defaultMime, Mime };
