/**
 * @copyright 2022 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  Content,
  ContentBody,
  ContentKey,
  LanguageTag,
  MediaType,
} from "./content.ts";
import { defaultMime } from "./mime.ts";
import { Resource, ResourceDivider } from "./pipeline.ts";

/**
 * Represents multiple views, i.e., concrete files with different contents for
 * various content types and languages, belonging to a single abstract resource.
 * If there is a `null` key in the {@link MultiView} map, it contains a
 * negotiator file (created by a {@link MultiViewNegotiator} function) that
 * is used to select a concrete file for a requested content type and
 * language.
 *
 * For example, there could be the following multiple views for a resource
 * `/foo/bar`:
 *
 * - `/foo/bar.html` (Negotiator HTML)
 * - `/foo/bar.ar.html` (Arabic HTML)
 * - `/foo/bar.en.html` (English HTML)
 * - `/foo/bar.zh-Hant.html` (Traditional Chinese HTML)
 * - `/foo/bar.ar.txt` (Arabic plain text)
 * - `/foo/bar.en.txt` (English plain text)
 * - `/foo/bar.zh-Hant.txt` (Traditional Chinese plain text)
 */
export type MultiView = Map<ContentKey | null, URL>;

/**
 * Represents functions to create a negotiator file for a {@link multiView}
 * resource.  Negotiator files are used to select a concrete file out of
 * `views` for a requested content type and language.
 *
 * For example, {@link htmlRedirector} creates a negotiator file that redirects
 * to the HTML file for the requested content language using JavaScript
 * `location.href` and `navigator.languages`.
 * @param views A map of content types and languages to paths to corresponding
 *              concrete files.
 * @param defaultView The default view to be used when there is no appropriate
 *                    choice.  This can be `undefined` if there is no default.
 * @returns A {@link Content} that select a concrete file for a requested
 *          content type and language.  If it is `undefined`, no negotiator
 *          file is created.
 */
export type MultiViewNegotiator = (
  views: MultiView,
  defaultView?: Content,
) => (Content | undefined);

/**
 * Options for {@link intoMultiView} method.
 */
export interface IntoMultiViewOptions {
  /**
   * A function to create a negotiator file for a {@link MultiView} resource.
   * See {@link MultiViewNegotiator} for more details.
   *
   * If unspecified, Apache .htaccess configuration is made instead.
   */
  negotiator?: MultiViewNegotiator;

  /**
   * The content key of the default view to be used when there is no appropriate
   * choice.  This can be `undefined` if there is no default view.
   */
  defaultContentKey?: ContentKey;

  /**
   * The index filename to be looked up when a URL ending with a slash is
   * requested.  This does not contain a file extension.  If omitted, the
   * default is `index`.
   */
  directoryIndex?: string;
}

/**
 * Creates a function to divide a {@link Resource} into multiple views with
 * distinct content types and languages (and optionally a negotiator file).
 *
 * Designed to work with {@link Pipeline.divide} method.
 * @param options Options for the function.  See {@link IntoMultiViewOptions}.
 * @returns A function that divides a {@link Resource} into multiple
 *          {@link Resource}s.
 */
export function intoMultiView(
  options: IntoMultiViewOptions = {},
): ResourceDivider {
  const directoryIndex = options.directoryIndex ?? "index";
  const defaultContentKey = options.defaultContentKey;
  return function* (resource: Resource): Iterable<Resource> {
    let defaultView: Content | undefined;
    const multiViews: MultiView = new Map<ContentKey | null, URL>();
    let lastModified: Date | undefined;
    multiViews.set(null, resource.path);
    for (const c of resource) {
      const path = resource.path;
      let suffix = defaultMime.getExtension(
        c.type.toString().replace(/;.*$/, ""),
      );
      if (c.language != null) {
        suffix = `${c.language.toString().toLowerCase()}.${suffix}`;
      }
      if (path.pathname.endsWith("/")) {
        path.pathname += `${directoryIndex}.${suffix}`;
      } else {
        const [dirname, basename] = path.pathname.split(/\/(?=[^/]+$)/);
        const name = basename.replace(/\.[^.]*$/, "");
        path.pathname = `${dirname}/${name}.${suffix}`;
      }
      if (c.key == defaultContentKey) defaultView = c;
      multiViews.set(c.key, path);
      if (lastModified == null || lastModified < c.lastModified) {
        lastModified = c.lastModified;
      }
      yield new Resource(path, [
        c.replace({
          metadata: async () => ({
            ...await c.getMetadata(),
            multiViews,
            viewKey: c.key,
          }),
        }),
      ]);
    }

    // If no negotiator is specified, create Apache .htaccess configuration
    // to enable MultiViews.
    // https://httpd.apache.org/docs/current/en/mod/mod_negotiation.html#multiviews
    if (options.negotiator == null) {
      yield new Resource(new URL(".htaccess", resource.path), [
        new Content(
          "Options +MultiViews",
          "application/octet-stream",
          null,
          new Date(1630284433391),
        ),
      ]);
      return;
    }

    const negotiator = options.negotiator(multiViews, defaultView);
    if (negotiator != null) {
      yield new Resource(resource.path, [
        negotiator.replace({
          language: null,
          metadata: async () => ({
            ...await defaultView?.getMetadata(),
            ...await negotiator.getMetadata(),
            multiViews,
            viewKey: null,
          }),
          lastModified,
        }),
      ]);
    }
  };
}

function isHtml(mediaType: MediaType): boolean {
  return mediaType.matches("text/html") ||
    mediaType.matches("application/xhtml+xml");
}

/**
 * Creates a negotiator file which depends on `navigator.languages` and
 * redirects to the HTML file for the requested content language using
 * browser-side JavaScript.
 *
 * Designed to work with {@link intoMultiView} function.
 */
export const htmlRedirector: MultiViewNegotiator = (
  views: MultiView,
  defaultContent?: Content,
): (Content | undefined) => {
  const multiViewsJSON: Record<string, string> = Object.fromEntries(
    [...views.entries()]
      .filter(([k, _]: [ContentKey | null, URL]) => k != null && isHtml(k.type))
      .map(([k, v]: [ContentKey | null, URL]) => {
        const pair: [string | null, string] = [
          k != null && k.language != null ? k.language.toString() : null,
          v.href,
        ];
        return pair;
      }),
  );
  const script = `
    <script>
    (function () {
      ${_negotiateUsingClientSideJavaScript$internal.toString()}
      var multiViews = ${JSON.stringify(multiViewsJSON)};
      var defaultLang =
        ${JSON.stringify(defaultContent?.language?.toString())} || undefined;
      var url = _negotiateUsingClientSideJavaScript$internal(
        document,
        navigator,
        multiViews,
        defaultLang
      );
      if (url != null) {
        location.href = url;
      }
    })();
    </script>
  `;
  const defaultLang = defaultContent?.language ?? LanguageTag.get("en");
  if (defaultContent != null && isHtml(defaultContent.type)) {
    return defaultContent.replace({
      async body(): Promise<ContentBody> {
        let layout = await defaultContent.getBody();
        if (typeof layout != "string") {
          const decoder = new TextDecoder(defaultContent.encoding || undefined);
          layout = decoder.decode(layout);
        }
        const match = /<(head|body)\s*[^>]*>/i.exec(layout);
        if (match == null) {
          return layout + script;
        }

        const languageLinks = [...views.entries()]
          .filter(([key, _]) => key != null && key.language != null)
          .map(async ([key, url]) => {
            const l = key?.language ?? defaultLang;
            const lName = await defaultLang.getLanguageName(l);
            const nativeName = await l.getLanguageName(l);
            return `<link rel="alternate" href="${url.href}"
              hreflang="${l.toString()}" title="${lName} (${nativeName})"
              />`;
          });
        return layout.substr(0, match.index) +
          script +
          (await Promise.all(languageLinks)).join("") +
          layout.substr(match.index + match[0].length);
      },
    });
  }

  return new Content(async () => {
    const languageLinks = [...views.entries()]
      .filter(([key, _]) => key != null && key.language != null)
      .map(async ([key, url]) => {
        const l = key?.language ?? defaultLang;
        const lName = await defaultLang.getLanguageName(l);
        const nativeName = await l.getLanguageName(l);
        return `<li><a rel="alternate" href="${url.href}"
          hreflang="${l.toString()}">
          ${lName} (${nativeName})
        </a></li>`;
      });
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting...</title>
        ${script}
      </head>
      <body>
        <script>
        document.body.style.display = 'none';
        </script>
        <p>There are the following languages available:</p>
        <ul>
          ${(await Promise.all(languageLinks)).join("")}
        </ul>
      </body>
    </html>
  `;
  }, "text/html; charset=utf-8");
};

export function _negotiateUsingClientSideJavaScript$internal(
  document: { cookie: string },
  navigator: { languages?: string[]; language?: string },
  multiViews: Record<string, string>,
  defaultLanguage?: string,
): string | undefined {
  interface LangTag {
    language: string;
    script?: string;
    region?: string;
  }

  function parseLanguageTag(
    tag: string,
  ): LangTag {
    const [lang, ...rest] = tag.toLowerCase().split(/[-_]/);
    const script = rest.length > 0 && rest[0].length == 4 ? rest[0] : undefined;
    const region = rest.length > 0 && rest[0].length == 2
      ? rest[0]
      : rest.length > 1
      ? rest[1]
      : undefined;
    return { language: lang, script, region };
  }

  function getPreferability(accept: LangTag, view: LangTag): number {
    return (accept.language === view.language ? 16 : 0) +
      (accept.script === view.script ? 8 : 0) +
      (accept.script == null ? 4 : 0) +
      (accept.region === view.region ? 2 : 0) +
      (accept.region == null ? 1 : 0);
  }

  const acceptLanguageCookie = document.cookie.match(
    /(?:^|;)\s*accept-language=([A-Za-z0-9_-]+)\s*(?:;|$)/,
  )?.[1];
  if (acceptLanguageCookie != null) {
    for (const lang in multiViews) {
      if (lang.toLowerCase() === acceptLanguageCookie.toLowerCase()) {
        return multiViews[lang];
      }
    }
  }

  const acceptLanguages: string[] = navigator.languages ??
    (navigator?.language != null ? [navigator.language] : []);
  const views: [LangTag, string][] = Object.entries(multiViews)
    .map(([k, v]: [string, string]) => [parseLanguageTag(k), v]);
  for (const l of acceptLanguages) {
    const acceptLang = parseLanguageTag(l);
    let maxPref = 0;
    let mostPrefUrl: string | undefined;
    for (const [viewLanguage, viewUrl] of views) {
      const pref = getPreferability(acceptLang, viewLanguage);
      if (pref > maxPref) {
        maxPref = pref;
        mostPrefUrl = viewUrl;
      }
    }
    if (maxPref >= 16 && mostPrefUrl != null) {
      return mostPrefUrl;
    }
  }

  const defaultUrl = defaultLanguage == null
    ? undefined
    : multiViews[defaultLanguage];
  if (defaultUrl != null) {
    return defaultUrl;
  }
}

/**
 * Creates a negotiator file which depends on `Accept-Language` and
 * serves the HTML file for the requested content language using PHP.
 *
 * Designed to work with {@link intoMultiView} function.
 */
export const phpNegotiator: MultiViewNegotiator = (
  views: MultiView,
  defaultContent?: Content,
): (Content | undefined) => {
  // FIXME: Deal with content types besides languages.
  const languages = [...views.entries()]
    .filter(([key]) => key != null && isHtml(key.type))
    .map(([key, path]: [ContentKey | null, URL]) => [
      key?.language,
      path.href.match(/([^]+)$/)?.[1],
    ]);
  const languagesJson = JSON.stringify(Object.fromEntries(languages));
  const languagesBase64 = btoa(languagesJson);
  const defaultLanguage = defaultContent?.language?.toString().toLowerCase();
  const php = `
<?php
// FIXME: Deal with Accept besides Accept-Language.
$views = json_decode(base64_decode('${languagesBase64}'), true);
$supported_languages = array_keys($views);
$accept_language
  = empty($_SERVER['HTTP_ACCEPT_LANGUAGE'])
  ? ''
  : $_SERVER['HTTP_ACCEPT_LANGUAGE'];
$preferred_languages = array();
$accept_languages = explode(',', $accept_language);
foreach ($accept_languages as $accept_language) {
  $terms = explode(';', $accept_language);
  $terms_no = count($terms);
  $q = 1.0;
  for ($j = 1; $j < $terms_no; ++$j) {
    $kv = explode('=', $terms[$j], 2);
    if (count($kv) < 2) continue;
    $k = trim($kv[0]);
    if ($k != 'q' && $k != 'Q') continue;
    $q = (float) trim($kv[1]);
  }
  $lang = strtolower($terms[0]);
  $preferred_languages[$lang] = $q;
}
if (isset($preferred_languages['*'])) {
  $preferred_languages['*'] = min($preferred_languages) / 2;
}

function parse_language_tag($tag) {
  $subtags = preg_split('/[-_]/', strtolower($tag));
  $lang = array_shift($subtags);
  $script = count($subtags) > 0 && strlen($subtags[0]) == 4
    ? $subtags[0]
    : null;
  $region = count($subtags) > 0 && strlen($subtags[0]) == 2
    ? $subtags[0]
    : (count($subtags) > 1 ? $subtags[1] : null);
  return array('language' => $lang, 'script' => $script, 'region' => $region);
}

function preferability($accept, $support) {
  $accept = parse_language_tag($accept);
  $support = parse_language_tag($support);
  return ($accept['language'] === $support['language'] ? 16 : 0) +
    (!is_null($accept['script']) &&
      $accept['script'] === $support['script'] ? 8 : 0) +
    (is_null($accept['script']) ? 4 : 0) +
    (!is_null($accept['region']) &&
      $accept['region'] === $support['region'] ? 2 : 0) +
    (is_null($accept['region']) ? 1 : 0);
}

$negotiated_languages = array();
foreach ($supported_languages as $language) {
  $negotiated_languages[$language] = 0;
  foreach ($preferred_languages as $preferred_language => $q) {
    $weight = preferability($language, $preferred_language) * $q;
    if ($negotiated_languages[$language] < $weight) {
      $negotiated_languages[$language] = $weight;
    }
  }
}

arsort($negotiated_languages);
$negotiated_language = count($negotiated_languages) > 0
  ? array_keys($negotiated_languages)[0]
  : ${JSON.stringify(defaultLanguage)};

if (!empty($_COOKIE['accept-language'])) {
  $cookie_language = strtolower(trim($_COOKIE['accept-language']));
  foreach ($supported_languages as $l) {
    if (strtolower($l) === $cookie_language) {
      $negotiated_language = $cookie_language;
      break;
    }
  }
}

if (empty($negotiated_language)) {
  header('Vary: Accept-Language, Cookie', true, 406);
  header('Content-Type: text/plain');
  exit;
}

$basename = 'index.' . strtolower($negotiated_language) . '.html';
$path = dirname(__FILE__) . "/$basename";
$mtime = filemtime($path);
if ($mtime === false) {
  header('Vary: Accept-Language, Cookie', true, 406);
  header('Content-Type: text/plain');
  exit;
}

$mimetype = mime_content_type($basename);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s \\G\\M\\T', $mtime));
header('Content-Type: ' .
  (empty($mimetype) || $mimetype === false ? 'text/html' : $mimetype));
if (!empty($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
  $if_modified_since = strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']);
  if ($if_modified_since !== false && $if_modified_since <= $mtime) {
    header('Vary: Accept-Language', true, 304);
    exit;
  }
}
header('Vary: Accept-Language, Cookie');
echo file_get_contents($path);
`;
  return new Content(php.trimStart(), "application/php; charset=utf-8");
};
