import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import { LanguageTag, LanguageTagError } from "./language_tag.ts";

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

Deno.test("LanguageTag.toString()", () => {
  assertEquals(LanguageTag.get("ZH").toString(), "zh");
  assertEquals(LanguageTag.get("ZH", "hant").toString(), "zh-Hant");
  assertEquals(LanguageTag.get("ZH", "hant", "tw").toString(), "zh-Hant-TW");
  assertEquals(LanguageTag.get("ZH", null, "hk").toString(), "zh-HK");
  assertEquals(
    LanguageTag.get("zho", "hans", "chn").toString(),
    "zho-Hans-CHN",
  );
});
