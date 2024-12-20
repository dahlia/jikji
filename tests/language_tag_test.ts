/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import { LanguageTag, LanguageTagError } from "../language_tag.ts";

Deno.test("LanguageTag.get()", () => {
  // Having all fields:
  const koHangKR = LanguageTag.get("ko", "Hang", "KR");
  assertStrictEquals(koHangKR.language, "ko");
  assertStrictEquals(koHangKR.script, "hang");
  assertStrictEquals(koHangKR.region, "kr");
  // Lacking region:
  const koKore = LanguageTag.get("ko", "Kore");
  assertStrictEquals(koKore.language, "ko");
  assertStrictEquals(koKore.script, "kore");
  assertStrictEquals(koKore.region, null);
  // Lacking script:
  const koPRK = LanguageTag.get("ko", null, "prk");
  assertStrictEquals(koPRK.language, "ko");
  assertStrictEquals(koPRK.script, null);
  assertStrictEquals(koPRK.region, "prk");
  // Lacking script and region:
  const ko = LanguageTag.get("KO");
  assertStrictEquals(ko.language, "ko");
  assertStrictEquals(ko.script, null);
  assertStrictEquals(ko.region, null);
  const zho = LanguageTag.get("zho");
  assertStrictEquals(zho.language, "zho");
  assertStrictEquals(zho.script, null);
  assertStrictEquals(zho.region, null);
  // Interning:
  assertStrictEquals(koHangKR, LanguageTag.get("ko", "hang", "kr"));
  assertStrictEquals(koKore, LanguageTag.get("ko", "kore", null));
  assertStrictEquals(koPRK, LanguageTag.get("ko", undefined, "prk"));
  assertStrictEquals(ko, LanguageTag.get("ko"));
  assertStrictEquals(zho, LanguageTag.get("zho"));
  // Invalid languages:
  assertThrows(() => LanguageTag.get(""), LanguageTagError, "language must be");
  assertThrows(
    () => LanguageTag.get("l"),
    LanguageTagError,
    "language must be",
  );
  assertThrows(
    () => LanguageTag.get("lang"),
    LanguageTagError,
    "language must be",
  );
  // Invalid scripts:
  assertThrows(
    () => LanguageTag.get("en", ""),
    LanguageTagError,
    "script must be",
  );
  assertThrows(
    () => LanguageTag.get("en", "Scr"),
    LanguageTagError,
    "script must be",
  );
  assertThrows(
    () => LanguageTag.get("en", "Scrip"),
    LanguageTagError,
    "script must be",
  );
  // Invalid regions:
  assertThrows(
    () => LanguageTag.get("en", "Latn", ""),
    LanguageTagError,
    "region must be",
  );
  assertThrows(
    () => LanguageTag.get("en", "Latn", "R"),
    LanguageTagError,
    "region must be",
  );
  assertThrows(
    () => LanguageTag.get("en", "Latn", "REGI"),
    LanguageTagError,
    "region must be",
  );
});

Deno.test("LanguageTag.fromString()", () => {
  // Having all fields:
  const koHangKR = LanguageTag.fromString("ko-Hang-KR");
  assertStrictEquals(koHangKR.language, "ko");
  assertStrictEquals(koHangKR.script, "hang");
  assertStrictEquals(koHangKR.region, "kr");
  // Lacking region:
  const koKore = LanguageTag.fromString("KO-kore");
  assertStrictEquals(koKore.language, "ko");
  assertStrictEquals(koKore.script, "kore");
  assertStrictEquals(koKore.region, null);
  // Lacking script:
  const koPRK = LanguageTag.fromString("ko-prk");
  assertStrictEquals(koPRK.language, "ko");
  assertStrictEquals(koPRK.script, null);
  assertStrictEquals(koPRK.region, "prk");
  // Lacking script and region:
  const ko = LanguageTag.fromString("KO");
  assertStrictEquals(ko.language, "ko");
  assertStrictEquals(ko.script, null);
  assertStrictEquals(ko.region, null);
  const eng = LanguageTag.fromString("eng");
  assertStrictEquals(eng.language, "eng");
  assertStrictEquals(eng.script, null);
  assertStrictEquals(eng.region, null);
  // Interning:
  assertStrictEquals(koHangKR, LanguageTag.get("ko", "hang", "kr"));
  assertStrictEquals(koKore, LanguageTag.get("ko", "kore", null));
  assertStrictEquals(koPRK, LanguageTag.get("ko", undefined, "prk"));
  assertStrictEquals(ko, LanguageTag.get("ko"));
  assertStrictEquals(eng, LanguageTag.get("eng"));
  // Invalid tag strings:
  assertThrows(
    () => LanguageTag.fromString(""),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("l"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("lang"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-S"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-Script"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en_Latn"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-Latn-"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-Latn-R"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en-Latn-REGI"),
    LanguageTagError,
    "Not a correct language tag",
  );
  assertThrows(
    () => LanguageTag.fromString("en_Latn_US"),
    LanguageTagError,
    "Not a correct language tag",
  );
});

Deno.test("LanguageTag#matches()", () => {
  const ko = LanguageTag.fromString("ko");
  const koKore = LanguageTag.fromString("ko-Kore");
  const koKR = LanguageTag.fromString("ko-KR");
  const koKP = LanguageTag.fromString("ko-KP");
  const zh = LanguageTag.fromString("zh");
  const zhHant = LanguageTag.fromString("zh-Hant");
  const zhHK = LanguageTag.fromString("zh-HK");
  const zhHantHK = LanguageTag.fromString("zh-Hant-HK");
  const zhHantTW = LanguageTag.fromString("zh-Hant-TW");
  const zhHansHK = LanguageTag.fromString("zh-Hans-HK");
  const en = LanguageTag.fromString("en");
  assert(koKR.matches(koKR));
  assert(koKR.matches(ko));
  assert(!koKR.matches(koKore));
  assert(!koKR.matches(koKP));
  assert(!koKR.matches(en));
  assert(zhHantHK.matches(zhHantHK));
  assert(zhHantHK.matches(zhHK));
  assert(zhHantHK.matches(zhHant));
  assert(zhHantHK.matches(zh));
  assert(!zhHantHK.matches(zhHantTW));
  assert(!zhHantHK.matches(zhHansHK));
  assert(!zhHantHK.matches(en));
});

Deno.test("LanguageTag#reduce()", () => {
  const en = LanguageTag.fromString("en");
  assertEquals([...en.reduce()], []);
  assertEquals([...en.reduce(true)], [en]);

  const enUS = LanguageTag.fromString("en-US");
  assertEquals([...enUS.reduce()], [en]);
  assertEquals([...enUS.reduce(true)], [enUS, en]);

  const enLatn = LanguageTag.fromString("en-Latn");
  assertEquals([...enLatn.reduce()], [en]);
  assertEquals([...enLatn.reduce(true)], [enLatn, en]);

  const enLatnUS = LanguageTag.fromString("en-Latn-US");
  assertEquals([...enLatnUS.reduce()], [enLatn, enUS, en]);
  assertEquals([...enLatnUS.reduce(true)], [enLatnUS, enLatn, enUS, en]);
});

Deno.test("LanguageTag#toLikelySubtag()", async () => {
  assertStrictEquals(
    await LanguageTag.get("en").toLikelySubtag(),
    LanguageTag.fromString("en-Latn-US"),
  );
  assertStrictEquals(
    await LanguageTag.get("ko").toLikelySubtag(),
    LanguageTag.fromString("ko-Kore-KR"),
  );
  assertStrictEquals(
    await LanguageTag.fromString("zh-TW").toLikelySubtag(),
    LanguageTag.fromString("zh-Hant-TW"),
  );
  assertStrictEquals(
    await LanguageTag.fromString("zh-Hanb").toLikelySubtag(),
    LanguageTag.fromString("zh-Hanb-TW"),
  );
});

const languageNames: Record<string, Record<string, string>> = {
  "en-Latn-US": {
    "en-Latn-US": "American English (Latin)",
    "ko": "Korean",
    "zh": "Chinese",
    "zh-Hant-TW": "Traditional Chinese (Taiwan)",
  },
  "ko": {
    "en-Latn-US": "영어(로마자, 미국)",
    "ko": "한국어",
    "zh": "중국어",
    "zh-Hant-TW": "중국어(번체, 대만)",
  },
  "zh": {
    "en-Latn-US": "美国英语（拉丁文）",
    "ko": "韩语",
    "zh": "中文",
    "zh-Hant-TW": "繁体中文（台湾）",
  },
  "zh-TW": {
    "en-Latn-US": "英文（拉丁字母，美國）",
    "ko": "韓文",
    "zh": "中文",
    "zh-Hant-TW": "繁體中文（台灣）",
  },
  "zh-Hant-TW": {
    "en-Latn-US": "英文（拉丁字母，美國）",
    "ko": "韓文",
    "zh": "中文",
    "zh-Hant-TW": "繁體中文（台灣）",
  },
};

// For faster testing, preload the CLDR data ahead of time.
const preloadingPromises: Promise<unknown>[] = [];
for (const [tag, expected] of Object.entries(languageNames)) {
  preloadingPromises.push(
    ...Object.keys(expected).map((l) =>
      LanguageTag.fromString(tag).getLanguageName(l)
    ),
  );
}

const permissions = LanguageTag.requiredPermissions;

for (const [tag, expected] of Object.entries(languageNames)) {
  Deno.test({
    name: `LanguageTag#getLanguageName() [${tag}]`,
    permissions,
    async fn() {
      const lang = LanguageTag.fromString(tag);
      for (const [tag, expectedName] of Object.entries(expected)) {
        assertEquals(await lang.getLanguageName(tag), expectedName);
        assertEquals(
          await lang.getLanguageName(LanguageTag.fromString(tag)),
          expectedName,
        );
      }
    },
  });
}

const territoryNames: Record<string, Record<string, string>> = {
  "en-Latn-US": {
    "CN": "China",
    "KR": "South Korea",
    "US": "United States",
  },
  "ko": {
    "CN": "중국",
    "KR": "대한민국",
    "US": "미국",
  },
  "zh-TW": {
    "CN": "中國",
    "KR": "南韓",
    "US": "美國",
  },
  "zh-Hant-TW": {
    "CN": "中國",
    "KR": "南韓",
    "US": "美國",
  },
};

// For faster testing, preload the CLDR data ahead of time.
for (const [tag, expected] of Object.entries(territoryNames)) {
  preloadingPromises.push(
    ...Object.keys(expected).map((t) =>
      LanguageTag.fromString(tag).getTerritoryName(t)
    ),
  );
}

for (const [tag, expected] of Object.entries(territoryNames)) {
  Deno.test({
    name: `LanguageTag#getTerritoryName() [${tag}]`,
    permissions,
    async fn() {
      const lang = LanguageTag.fromString(tag);
      for (const [territory, expectedName] of Object.entries(expected)) {
        assertEquals(await lang.getTerritoryName(territory), expectedName);
      }
    },
  });
}

const scriptNames: Record<string, Record<string, string>> = {
  "en-Latn-US": {
    "Latn": "Latin",
    "Hang": "Hangul",
    "Hant": "Traditional",
  },
  "ko": {
    "Latn": "로마자",
    "Hang": "한글",
    "Hant": "번체",
  },
  "zh-TW": {
    "Latn": "拉丁字母",
    "Hang": "諺文",
    "Hant": "繁體",
  },
  "zh-Hant-TW": {
    "Latn": "拉丁字母",
    "Hang": "諺文",
    "Hant": "繁體",
  },
};

// For faster testing, preload the CLDR data ahead of time.
for (const [tag, expected] of Object.entries(scriptNames)) {
  preloadingPromises.push(
    ...Object.keys(expected).map((s) =>
      LanguageTag.fromString(tag).getScriptName(s)
    ),
  );
}

for (const [tag, expected] of Object.entries(scriptNames)) {
  Deno.test({
    name: `LanguageTag#getScriptName() [${tag}]`,
    permissions,
    async fn() {
      const lang = LanguageTag.fromString(tag);
      for (const [script, expectedName] of Object.entries(expected)) {
        assertEquals(await lang.getScriptName(script), expectedName);
      }
    },
  });
}

Deno.test("LanguageTag#toString()", () => {
  assertEquals(LanguageTag.get("ZH").toString(), "zh");
  assertEquals(LanguageTag.get("ZH", "hant").toString(), "zh-Hant");
  assertEquals(LanguageTag.get("ZH", "hant", "tw").toString(), "zh-Hant-TW");
  assertEquals(LanguageTag.get("ZH", null, "hk").toString(), "zh-HK");
  assertEquals(
    LanguageTag.get("zho", "hans", "chn").toString(),
    "zho-Hans-CHN",
  );
});

Deno.test("Deno.inspect(LanguageTag)", () => {
  const en = LanguageTag.get("en");
  const koKR = LanguageTag.get("ko", null, "KR");
  const zhHansCN = LanguageTag.get("zh", "Hans", "CN");
  assertEquals(Deno.inspect(en), "LanguageTag(en)");
  assertEquals(Deno.inspect(koKR), "LanguageTag(ko-KR)");
  assertEquals(Deno.inspect(zhHansCN), "LanguageTag(zh-Hans-CN)");
  assertEquals(
    Deno.inspect([en, koKR, zhHansCN]),
    "[ LanguageTag(en), LanguageTag(ko-KR), LanguageTag(zh-Hans-CN) ]",
  );
});

Deno.test("LanguageTagError()", () => {
  const e = new LanguageTagError();
  assertEquals(e.message, "");
  assertEquals(e.name, "LanguageTagError");
  const e2 = new LanguageTagError("error message");
  assertEquals(e2.message, "error message");
  assertEquals(e2.name, "LanguageTagError");
});

await Promise.all(preloadingPromises);
