<!-- deno-fmt-ignore-file -->
<img src="jikji.png" width="95" height="190" align="left">

Jikji: small static site generator toolkit
==========================================

Jikji is a small toolkit for building your own static site generators on [Deno].

Currently, it provides the below *composable building blocks*:

 -  Parallel generation
 -  Partial generation
 -  Flexible permalinks
 -  Watch changes & reload
 -  First-class support for [content negotiation] on type & language
 -  Markdown (powered by [markdown-it])
 -  EJS/ETS template engine (powered by [dejs])
 -  [Sass/SCSS] stylesheet preprocessor (through subprocess)

[Deno]: https://deno.land/
[content negotiation]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation
[markdown-it]: https://github.com/markdown-it/markdown-it
[dejs]: https://github.com/syumai/dejs
[Sass/SCSS]: https://sass-lang.com/


Example
-------

~~~~ typescript
import {
  intoDirectory,
  scanFiles,
  rebase,
  writeFiles
} from "https://deno.land/x/jikji/mod.ts";
import { markdown } from "https://deno.land/x/jikji/markdown.ts";

const baseUrl = new URL("http://localhost:8000/");
const outDir = "public_html";

// Scans for Markdown files in the posts/ directory:
await scanFiles(["posts/**/*.md"])
  // Renders posts written in Markdown to HTML:
  .transform(markdown(), { type: "text/markdown" })
  // Makes permalinks like posts/foobar/ instead of posts/foobar.md
  .move(intoDirectory())
  // Maps the current directory to the target URL <https://example.com/>:
  // E.g., ./posts/foobar.md -> https://example.com/posts/foobar/
  .move(rebase("posts/", baseUrl))
  // Writes the files to the output directory (public_html/):
  .forEach(writeFiles(outDir, baseUrl));
  // If you want watch mode, use forEachWithReloading() instead:
  // .forEachWithReloading(writeFiles(outDir, baseUrl));
~~~~

More realistic examples are placed in the [*examples/* directory](examples/).


Key concepts
------------

Building blocks that Jikji provides are based on the following concepts:

 -  [`Pipeline`] represents the entire steps from the input to the output.
    It's like a stream of zero or more `Resource`s.  Its whole process is
    lazy so that if some parts don't need to be generated again they are even
    not loaded at all.
    (In the above example, a new `Pipeline` is acquired using `scanFiles()`
    function, but `scanFiles()` does not immediately list files nor load
    their contents.)
 -  [`Resource`] represents an abstract resource which is mapped to a unique
    `path`.  Its `path` is a rather URL than a filesystem path, which means
    it has a scheme like `https` or `file` and can end with a slash.
    (Note that `intoDirectory()` function turns *posts/foobar.md* into
    *posts/foobar/* in the above example.) `Resource` also can has multiple
    representations for [content negotiation] on type and language.
 -  [`Content`] represents an actual content which can belong to `Resource`s
    as a representation.  The `ContentBody` can be lazily loaded and either
    a Unicode text or binary data.  They are typed through IANA `MediaType`s
    (formerly known as MIME types).  Optionally, they can have their
    RFC 5656 `LanguageTag` to describe their natural language.  If you want
    you can put additional `metadata` like `title` or `published` as well.
 -  [`ResourceTransformer`] transforms a `Resource` into a modified `Resource`.
    It purposes to change multiple `Resources` into new ones in immutable style
    by being passed to `Pipeline#map()` method.
 -  [`PathTransformer`] transforms a `URL` into a modified `URL`.  It purposes
    to change multiple `Resource`s `path`s into new ones in immutable style by
    being passed to `Pipeline#move()` method.
    (In the above example, `intoDirectory()` and `rebase()` functions return
    `PathTransformer`s.)
 -  [`ContentTransformer`] transforms a `Content` into a modified `Content`.
    It purposes to change multiple representations of `Resource`s into new ones
    in immutable style by being passed to `Pipeline#transform()` method.
    (In the above example, `markdown()` function returns a
    `ContentTransformer`.)

See also [API docs].


[`Pipeline`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fmod.ts#Pipeline
[`Resource`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fmod.ts#Resource
[`Content`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fmod.ts#Content
[`ResourceTransformer`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fpipeline.ts#ResourceTransformer
[`PathTransformer`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fpipeline.ts#PathTransformer
[`ContentTransformer`]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fpipeline.ts#ContentTransformer
[API docs]: https://doc.deno.land/https/deno.land%2Fx%2Fjikji%2Fmod.ts


License
-------

Distributed under [LGPL 3.0].

[LGPL 3.0]: https://www.gnu.org/licenses/lgpl-3.0.html
