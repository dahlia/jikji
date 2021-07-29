import { parse } from "https://deno.land/std@0.102.0/flags/mod.ts";
import { serve } from "https://deno.land/std@0.102.0/http/server.ts";
import { info } from "https://deno.land/std@0.102.0/log/mod.ts";
import staticFiles from "https://deno.land/x/static_files@1.1.0/mod.ts";
import { renderListTemplate, renderTemplate } from "../../ejs.ts";
import { frontMatter, markdown } from "../../markdown.ts";
import { defaultMime } from "../../file.ts";
import {
  anyRepresentations,
  havingExtension,
  intoDirectory,
  Pipeline,
  rebase,
  replaceBasename,
  Resource,
  scanFiles,
  setupConsoleLog,
  when,
  writeFiles,
} from "../../mod.ts";
import sass from "../../sass.ts";

// Makes logs show up in the console:
await setupConsoleLog();

// Takes CLI arguments & options:
const args = parse(Deno.args, {
  boolean: ["help", "remove", "watch", "serve"],
  default: {
    help: false,
    "out-dir": "public_html",
    remove: false,
    watch: false,
    serve: false,
    host: "127.0.0.1",
    port: 8000,
  },
  alias: {
    h: "help",
    o: "out-dir",
    r: "remove",
    w: "watch",
    s: "serve",
    server: "serve",
    p: "port",
    H: "host",
  },
  unknown: (opt: string) => {
    console.error(`Unknown option: ${opt}.`);
    Deno.exit(1);
  },
});

// If -h/--help is requested, print it and exit:
if (args.help) {
  console.log("Usage: main.ts [options] [SRC=.] [BASE_URL]");
  console.log("\nOptions:");
  console.log("  -h/--help:    Show this help message and exit.");
  console.log("  -o/--out-dir: Output directory.  [public_html]");
  console.log("  -r/--remove:  Empty the output directory first.");
  console.log("  -s/--serve:   Run an HTTP server.");
  console.log("  -H/--host:    Hostname to listen HTTP requests.  [127.0.0.1]");
  console.log("  -p/--port:    Port number to listen HTTP requests.  [8080]");
  console.log("  -w/--watch:   Watch the SRC directory for changes.");
  Deno.exit(0);
}

if (
  typeof args.port != "number" ||
  args.port < 0 || args.port > 65535 || args.port % 1 !== 0
) {
  console.error("Error: -p/--port: Invalid port number.");
  Deno.exit(1);
}

// The path of the input directory:
const srcDir: string = args._.length > 0 ? args[0] : ".";

// The path of the output directory:
const outDir: string = args["out-dir"];

// The base URL for permalinks:
const baseUrl: URL = new URL(
  args._.length > 1 ? args[1] : `http://${args.host}:${args.port}/`,
);

// Scans for Markdown files in posts/ directory, and static assets in static/:
const pipeline = scanFiles(["posts/**/*.md", "static/**/*"], { root: srcDir })
  // Maps the current directory to the target URL <https://example.com/>:
  // E.g., ./2021/07/03/hello-world.md -> https://example.com/2021/07/03/hello-world.md
  .move(rebase("./", baseUrl))
  // Strips .md extensions and adds trailing slashes instead:
  // E.g., 2021/07/03/hello-world.md becomes 2021/07/03/hello-world/
  .move(when(havingExtension("md"), intoDirectory()))
  // Compiles SCSS to CSS:
  .transform(sass(), { type: "text/x-scss" })
  // Replaces .scss extensions with .css:
  .move(replaceBasename(/\.s[ac]ss/, ".css"))
  // Extracts metadata from Markdown files' front matter:
  .transform(frontMatter, { type: "text/markdown" })
  // Renders posts written in Markdown to HTML:
  .transform(markdown(), { type: "text/markdown" })
  // Renders the whole page for posts using the EJS template:
  .transform(
    renderTemplate("templates/post.ejs", { baseUrl }),
    { type: "text/html" },
  )
  // Adds the home page (a list of posts):
  .addSummaries(async function* (p: Pipeline) {
    const posts = p.filter(anyRepresentations({ type: "text/html" }));
    yield new Resource(baseUrl, [
      await renderListTemplate("templates/list.ejs", posts, { baseUrl }),
    ]);
  });

if (args.remove) {
  // Empty the output directory (public_html/) first:
  try {
    await Deno.remove(outDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }
}

// Generates the static site files:
async function build(): Promise<void> {
  if (args.watch) {
    // Writes the files to the output directory (public_html/) and watches
    // the input files for changes (^C to stop):
    info(`Watching ${outDir} for changes...`);
    await pipeline.forEachWithReloading(writeFiles(outDir, baseUrl));
  } else {
    // Writes the files to the output directory (public_html/):
    await pipeline.forEach(writeFiles(outDir, baseUrl));
  }
}

// Runs an HTTP server:
async function runServer(): Promise<void> {
  const httpd = serve({ port: args.port, hostname: args.host });
  const server = staticFiles(outDir, {
    setHeaders(headers: Headers, path: string) {
      const type = defaultMime.getType(path);
      if (type != null) {
        headers.set("Content-Type", type);
      }
    },
  });
  info(`Listening on http://${args.host}:${args.port}/`);
  for await (const req of httpd) {
    await server(req);
  }
}

await Promise.all(args.serve ? [build(), runServer()] : [build()]);