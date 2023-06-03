<!-- deno-fmt-ignore-file -->

Jikji changelog
===============

Version 0.3.0
-------------

To be released.

 -  Built-in `MultiViewNegotiator`s in *multiview.ts* module became aware of
    the cookie `accept-language`, which is the most prior option for choosing
    the language:
     - `htmlRedirector`
     - `phpNegotiator`
 -  `ContentMetadata` type from *content.ts* module no more includes `null`.
 -  Added `LanguageTag.requiredPermissions` constant.
 -  Added `WriteFilesOptions` interface to *file.ts* module, which defines
    what options are available for `writeFiles()` function.
     -  Added `WriteFilesOptions#onWrite` field.
 -  The *sass.ts* module no more depends on Dart-Sass CLI (`sass`) or
    SassC (`sassc`), so no more requires `--allow-run` permission on Deno.
    Instead, it depends on [Deno Sass], a TypeScript & WebAssembly binding of
    [grass], which is written in Rust.  In order to load WebAssembly binary,
    now it requires `--allow-net=deno.land` instead.  [[#15]]
     -  The indented syntax of Sass (_\*.sass_) is no more supported.  Only
        curly-bracket syntax of SCSS (_\*.scss_) is supported.
     -  `Options#outputStyle` field from *sass.ts* module no more includes
        `"nested"` and `"compact"`.
     -  Removed `Options#precision` field from *sass.ts* module.
     -  Removed `Options#sourceMap` field from *sass.ts* module.
     -  Removed `getSassCompiler()` function from *sass.ts* module.
     -  Removed `SASS_MEDIA_TYPE` constant from *sass.ts* module.
     -  Added `REQUIRED_PERMISSIONS` constant to *sass.ts* module.

[Deno Sass]: https://github.com/hironichu/denosass
[grass]: https://github.com/connorskees/grass
[#15]: https://github.com/dahlia/jikji/issues/15


Version 0.2.2
-------------

Released on November 28, 2021.

 -  Fixed `Pipeline#divide()` method's bug where it had divide virtually no
    resources.


Version 0.2.1
-------------

Released on November 27, 2021.

 -  Fixed type errors from _markdown.ts_ module.


Version 0.2.0
-------------

Released on November 22, 2021.

 -  `Pipeline` became to merge its representations into the existing `Resource`
    when a `Resource` having duplicate `path` is added.
 -  Added `ScanFilesOptions` interface in _file.ts_ module.
 -  Removed the optional `mime` parameter from `scanFiles()`, and instead
    `options` parameter became to have the optional `mime` field.
 -  Moved `relativePathToFileUrl()` function from _path.ts_ module to
    _file.ts_ module.
 -  Changed `rebase()` function's signature so that it does not take
    strings anymore but only `URL` objects.
 -  Added `rebase()` function, which takes both `URL`s and strings,
    to _file.ts_ module.
 -  Added `detectLanguage()` function, `DetectLanguageOptions` type,
    `DetectLanguagePathnameOptions` interface, and
    `DetectLanguageSearchParamsOptions` interface to _path.ts_ module.
 -  Renamed `Resource#hasRepresentation()` method to `has()`.
 -  Renamed `Resource#getRepresentation()` method to `get()`.
 -  Renamed `Resource#addRepresentation()` method to `add()`.
 -  Added `LanguageTag#reduce()` method.
 -  Added `LanguageTag#toLikelySubtag()` method.
 -  Added `LanguageTag#getLanguageName()` method.
 -  Added `LanguageTag#getTerritoryName()` method.
 -  Added `LanguageTag#getScriptName()` method.
 -  Added `Resource#keys()` method.
 -  Added `ResourceDivider` type to _pipeline.ts_ module.
 -  Added `Pipeline#divide()` method.
 -  Added _mime.ts_ module.
 -  Moved `Mime` class from _file.ts_ module to _mime.ts_ module.
 -  Moved `extendMime()` function from _file.ts_ module to _mime.ts_ module.
 -  Moved `defaultMime` from _file.ts_ module to _mime.ts_ module.
 -  Added _miltiview.ts_ module.
 -  `writeFiles()` function became to disallow `Resource` which consists with
    multiple `Content`s.
 -  Added `ContentFilter#negate` field.
 -  `ContentFilter#language` and `ContentFilter#exactLanguage` fields now can
    be `null` to mean emptiness of `Content#language` field.
 -  `ContentFilter#type`, `ContentFilter#exactType`, `ContentFilter#language`,
    and `ContentFilter#exactLanguage` fields now can be an array, which is
    satisfied when any of the given values matches the content.
 -  Added `bracketedSpans` to _markdown.ts_ module.  (See also the [module's
    website](https://github.com/mb21/markdown-it-bracketed-spans).)
 -  Added `content` (which is a `Content` instance) as a common context used for
    templates rendered by `renderListTemplate()` in _ejs.ts_ module.


Version 0.1.1
-------------

Released on July 30, 2021.

 -  Fixed bugs that `rebase()` function and other functions dependent on it
    in _path.ts_ and _file.ts_ modules had not properly deal with Windows-style
    file paths.  [[#2]]

[#2]: https://github.com/dahlia/jikji/issues/2


Version 0.1.0
-------------

Initial release. Released on July 27, 2021.
