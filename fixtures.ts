import { dirname, join } from "https://deno.land/std@0.100.0/path/mod.ts";
import { mime } from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import { Content, Resource } from "./resource.ts";

export function* makeResources(
  files: Record<string, string>,
  lastModified?: Date | null,
): Iterable<Resource> {
  const paths = Object.keys(files);
  paths.sort();
  for (const path of paths) {
    const body = files[path];
    const pathWithoutQs = path.replace(/(\?[^#]*)?(#.*)?$/, "");
    let type = mime.getType(pathWithoutQs);
    if (type == null) {
      type = "application/octet-stream";
    } else {
      type += "; charset=utf-8";
    }
    const content = new Content(body, type, null, lastModified);
    const resource = new Resource("file:///tmp/site/" + path, [content]);
    yield resource;
  }
}

export async function withTempDir(
  options:
    | Deno.MakeTempOptions & { fn: (path: string) => (void | Promise<void>) }
    | ((path: string) => (void | Promise<void>)),
): Promise<void> {
  let fn: (path: string) => (void | Promise<void>);
  let opts: Deno.MakeTempOptions | undefined;
  if (typeof options == "function") {
    fn = options;
    opts = undefined;
  } else {
    fn = options.fn;
    opts = options;
  }
  const tempDir = await Deno.makeTempDir(opts);
  try {
    const r = fn(tempDir);
    if (r instanceof Promise) {
      await r;
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

export function withFixture(
  files: Record<string, string> | string[],
  fn: (path: string, tempDir: string) => (void | Promise<void>),
): Promise<void> {
  if (files instanceof Array) {
    files = Object.fromEntries(files.map((k) => [k, ""]));
  }
  const encoder = new TextEncoder();
  return withTempDir({
    prefix: "jikji-t-",
    async fn(tempDir: string) {
      const fxDir = join(tempDir, "fx");
      const promises = Object.entries(files)
        .map(async ([k, v]) => {
          const fp = join(fxDir, k);
          await Deno.mkdir(dirname(fp), { recursive: true });
          await Deno.writeFile(fp, encoder.encode(v));
        });
      await Promise.all(promises);
      const tempDir2 = join(tempDir, "tmp");
      await Deno.mkdir(tempDir2, { recursive: true });
      const r = fn(fxDir, tempDir2);
      if (r instanceof Promise) {
        await r;
      }
    },
  });
}
