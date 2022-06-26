import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.145.0/testing/asserts.ts";
import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.31-alpha/deno-dom-wasm.ts";
import { assertEquals$ } from "./asserts.ts";
import { Content, ContentKey, LanguageTag, MediaType } from "../content.ts";
import {
  _negotiateUsingClientSideJavaScript$internal,
  htmlRedirector,
  intoMultiView,
  MultiView,
} from "../multiview.ts";
import { Resource } from "../resource.ts";

async function toArray<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) result.push(item);
  return result;
}

Deno.test("intoMultiView()", async () => {
  const divider = intoMultiView();
  const enHtml = new Content("<h1>Hello</h1>", "text/html", "en");
  const enMarkdown = new Content("# Hello", "text/markdown", "en");
  const jjeHtml = new Content("<h1>반갑수다</h1>", "text/html", "jje");
  const jjeMarkdown = new Content("# 반갑수다", "text/markdown", "jje");
  const zhHtml = new Content("<h1>你好</h1>", "text/html", "zh");
  const zhMarkdown = new Content("# 你好", "text/markdown", "zh");
  const resource = new Resource("https://example.com/", [
    enHtml,
    enMarkdown,
    jjeHtml,
    jjeMarkdown,
    zhHtml,
    zhMarkdown,
  ]);
  const dividedResources = await toArray(divider(resource));
  const pathsToResources = new Map<string, Resource>(
    dividedResources.map((r) => [r.path.href, r]),
  );
  const multiViews = new Map<ContentKey | null, URL>(
    dividedResources
      .filter((r) => !r.path.pathname.endsWith(".htaccess"))
      .map((r) => [[...r][0].key, r.path]),
  );
  multiViews.set(null, resource.path);
  await assertEquals$(
    pathsToResources,
    new Map([
      [
        "https://example.com/index.en.html",
        new Resource("https://example.com/index.en.html", [
          enHtml.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/html", "en"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/index.en.markdown",
        new Resource("https://example.com/index.en.markdown", [
          enMarkdown.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/markdown", "en"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/index.jje.html",
        new Resource("https://example.com/index.jje.html", [
          jjeHtml.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/html", "jje"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/index.jje.markdown",
        new Resource("https://example.com/index.jje.markdown", [
          jjeMarkdown.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/markdown", "jje"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/index.zh.html",
        new Resource("https://example.com/index.zh.html", [
          zhHtml.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/html", "zh"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/index.zh.markdown",
        new Resource("https://example.com/index.zh.markdown", [
          zhMarkdown.replace({
            metadata: {
              multiViews,
              viewKey: ContentKey.get("text/markdown", "zh"),
            },
          }),
        ]),
      ],
      [
        "https://example.com/.htaccess",
        new Resource("https://example.com/.htaccess", [
          new Content(
            "Options +MultiViews",
            "application/octet-stream",
            null,
            new Date(1630284433391),
          ),
        ]),
      ],
    ]),
  );

  const dividerWithNegotiator = intoMultiView({
    negotiator: (views: MultiView, defaultView?: Content) =>
      new Content(
        async () =>
          `negotiator:\n${
            [...views.entries()].map(([k, u]) =>
              `${k == null ? "(N/A)" : `${k.type} [${k.language}]`}: ${u}`
            ).sort().join("\n")
          }\ndefault:\n${await defaultView?.getBody()}`,
        "text/html",
        null,
      ),
    defaultContentKey: ContentKey.get("text/html", "en"),
  });
  const dividedResourcesWithNegotiator = await toArray(
    dividerWithNegotiator(resource),
  );
  const pathsToResourcesWithNegotiator = new Map<string, Resource>(
    dividedResourcesWithNegotiator.map((r) => [r.path.href, r]),
  );
  await assertEquals$(
    pathsToResourcesWithNegotiator,
    new Map([
      ...[...pathsToResources.entries()]
        .filter(([k, _]: [string, Resource]) => !k.endsWith("/.htaccess")),
      [
        "https://example.com/",
        new Resource("https://example.com/", [
          new Content(
            "negotiator:\n" +
              "(N/A): https://example.com/\n" +
              "text/html [en]: https://example.com/index.en.html\n" +
              "text/html [jje]: https://example.com/index.jje.html\n" +
              "text/html [zh]: https://example.com/index.zh.html\n" +
              "text/markdown [en]: https://example.com/index.en.markdown\n" +
              "text/markdown [jje]: https://example.com/index.jje.markdown\n" +
              "text/markdown [zh]: https://example.com/index.zh.markdown\n" +
              "default:\n" +
              "<h1>Hello</h1>",
            "text/html",
            null,
            new Date(
              dividedResources.map((r) => +r.lastModified).sort().reverse()[0],
            ),
            { multiViews, viewKey: null },
          ),
        ]),
      ],
    ]),
  );
});

const defaultContents: Record<string, Content | undefined> = {
  "undefined": undefined,
  "defaultContent": new Content(
    `<html><head></head><body><h1>Layout</h1></body></html>`,
    "application/xhtml+xml",
  ),
};

for (const [name, defaultContent] of Object.entries(defaultContents)) {
  Deno.test({
    name: `htmlRedirector(views, ${name})`,
    permissions: LanguageTag.requiredPermissions,
    async fn() {
      const views = {
        "en": "https://example.com/index.en.html",
        "ko-KR": "https://example.com/index.ko-kr.html",
        "zh-Hans": "https://example.com/index.zh-hans.html",
        "": "https://example.com/index.html",
      };
      const multiViews: MultiView = new Map(
        Object.entries(views).map(
          ([lang, href]) => [
            lang === "" ? null : ContentKey.get("text/html", lang),
            new URL(href),
          ],
        ),
      );
      const html = htmlRedirector(multiViews, defaultContent);
      assertNotEquals(html, null);
      assertEquals(
        html?.type,
        defaultContent?.type ?? MediaType.fromString("text/html; charset=utf8"),
      );
      assertEquals(html?.language, defaultContent?.language ?? null);
      const parser = new DOMParser();
      const contentBody = await html?.getBody();
      const contentText = typeof contentBody == "string"
        ? contentBody
        : new TextDecoder(html?.encoding ?? undefined).decode(contentBody);
      const doc = parser.parseFromString(contentText, "text/html");
      assertNotEquals(doc, null);
      const links: Record<string, string> = Object.fromEntries(
        Array.from(
          doc?.querySelectorAll(
            "a[href][hreflang][rel=alternate], " +
              "link[href][hreflang][rel=alternate]",
          ) as Iterable<Element>,
          (link: Element) => [
            link.getAttribute("hreflang"),
            link.getAttribute("href"),
          ],
        ),
      );
      assertEquals(
        links,
        Object.fromEntries(
          Object.entries(views).filter(([lang]) => lang !== ""),
        ),
      );
      const scriptText = doc?.querySelector("script")?.innerText ?? "";
      const script = new Function(
        "document",
        "navigator",
        "location",
        scriptText,
      );
      const loc = { href: "" };
      script({ cookie: "" }, { language: "ko" }, loc);
      assertEquals(loc.href, "https://example.com/index.ko-kr.html");
      script(
        { cookie: "foo=zh-hans; accept-language=zh" },
        { language: "ko" },
        loc,
      );
      assertEquals(loc.href, "https://example.com/index.ko-kr.html");
      script({ cookie: "accept-language=zh-hans" }, { language: "ko" }, loc);
      assertEquals(loc.href, "https://example.com/index.zh-hans.html");
      script({ cookie: "foo=1; accept-language=ZH-Hans; bar=2" }, {
        language: "ko",
      }, loc);
      assertEquals(loc.href, "https://example.com/index.zh-hans.html");
    },
  });
}

Deno.test("_negotiateUsingClientSideJavaScript$internal()", () => {
  const negotiate = _negotiateUsingClientSideJavaScript$internal;
  const views = {
    "en": "https://example.com/index.en.html",
    "ko-KR": "https://example.com/index.ko-kr.html",
    "zh-Hans": "https://example.com/index.zh-hans.html",
  };
  assertEquals(
    negotiate({ cookie: "" }, { languages: ["ko-kr", "en-us"] }, views, "en"),
    "https://example.com/index.ko-kr.html",
  );
  assertEquals(
    negotiate({ cookie: "" }, { languages: ["ko", "en-us"] }, views, "en"),
    "https://example.com/index.ko-kr.html",
  );
  assertEquals(
    negotiate({ cookie: "" }, { languages: ["en-us"] }, views, "zh-Hans"),
    "https://example.com/index.en.html",
  );
  assertEquals(
    negotiate({ cookie: "a=1; b=2" }, { language: "ko-" }, views, "en"),
    "https://example.com/index.ko-kr.html",
  );
  assertEquals(
    negotiate({ cookie: "c=3" }, { languages: ["de", "in"] }, views, "en"),
    "https://example.com/index.en.html",
  );
  assertEquals(
    negotiate({ cookie: "d=4" }, { language: "ja" }, views, "zh-Hans"),
    "https://example.com/index.zh-hans.html",
  );
  assertEquals(
    negotiate({ cookie: "" }, {}, views, "zh-Hans"),
    "https://example.com/index.zh-hans.html",
  );
  assertEquals(
    negotiate({ cookie: "" }, {}, views, "de"),
    undefined,
  );
  assertEquals(
    negotiate(
      { cookie: "accept-language=de" },
      { languages: ["ko-kr", "en-us"] },
      views,
      "en",
    ),
    "https://example.com/index.ko-kr.html",
  );
  assertEquals(
    negotiate(
      { cookie: "accept-language=zh-hans" },
      { languages: ["ko-kr", "en-us"] },
      views,
      "en",
    ),
    "https://example.com/index.zh-hans.html",
  );
  assertEquals(
    negotiate(
      { cookie: "foo=1; accept-language=ZH-Hans; bar=2" },
      { languages: ["ko-kr", "en-us"] },
      views,
      "en",
    ),
    "https://example.com/index.zh-hans.html",
  );
});
