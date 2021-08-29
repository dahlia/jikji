<!-- deno-fmt-ignore-file -->

Jikji changelog
===============

Version 0.2.0
-------------

To be released.

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
 -  Added `ContentFilter#negate` field.
 -  `ContentFilter#language` and `ContentFilter#exactLanguage` fields now can
    be `null` to mean emptiness of `Content#language` field.


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
