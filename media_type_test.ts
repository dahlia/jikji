/**
 * @copyright 2021 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.108.0/testing/asserts.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";

Deno.test("MediaType.get()", () => {
  // text/plain
  const txt = MediaType.get("Text", "Plain");
  assertStrictEquals(txt.type, "text");
  assertEquals(txt.subtype, ["plain"]);
  assertEquals(txt.suffixes, []);
  assertEquals(txt.parameters, {});
  // application/vnd.oasis.opendocument.text:
  const odt = MediaType.get("application", [
    "Vnd",
    "Oasis",
    "OpenDocument",
    "Text",
  ]);
  assertStrictEquals(odt.type, "application");
  assertEquals(odt.subtype, ["vnd", "oasis", "opendocument", "text"]);
  assertEquals(odt.suffixes, []);
  assertEquals(odt.parameters, {});
  // application/xhtml+xml; charset=utf-8:
  const xhtml = MediaType.get("Application", ["xhtml"], ["xml"], {
    CharSet: "UTF8",
  });
  assertStrictEquals(xhtml.type, "application");
  assertEquals(xhtml.subtype, ["xhtml"]);
  assertEquals(xhtml.suffixes, ["xml"]);
  assertEquals(xhtml.parameters, { charset: "utf-8" });
  // Interning:
  assertStrictEquals(
    odt,
    MediaType.get("application", [
      "Vnd",
      "Oasis",
      "OpenDocument",
      "Text",
    ]),
  );
  assertStrictEquals(
    xhtml,
    MediaType.get("Application", ["xhtml"], ["xml"], {
      CharSet: "utf-8",
    }),
  );
  // Invalid media types:
  assertThrows(
    () => MediaType.get("", ["plain"]),
    MediaTypeError,
    "type cannot be empty",
  );
  assertThrows(
    () => MediaType.get("text ", ["plain"]),
    MediaTypeError,
    "type cannot contains any whitespace",
  );
  assertThrows(
    () => MediaType.get("text", [""]),
    MediaTypeError,
    "subtype cannot be empty",
  );
  assertThrows(
    () => MediaType.get("application", ["vnd", "oasis", "opendocument", ""]),
    MediaTypeError,
    "subtype cannot be empty",
  );
  assertThrows(
    () => MediaType.get("text", ["plain "]),
    MediaTypeError,
    "subtype cannot contains any whitespace",
  );
  assertThrows(
    () => MediaType.get("application", ["vnd", "ms-excel "]),
    MediaTypeError,
    "subtype cannot contains any whitespace",
  );
  assertThrows(
    () => MediaType.get("application", ["xhtml"], [""]),
    MediaTypeError,
    "suffix cannot be empty",
  );
  assertThrows(
    () => MediaType.get("application", ["xhtml"], ["xml "]),
    MediaTypeError,
    "suffix cannot contains any whitespace",
  );
  assertThrows(
    () => MediaType.get("text", ["plain"], [], { "": "utf-8" }),
    MediaTypeError,
    "Parameter names cannot be empty",
  );
  assertThrows(
    () => MediaType.get("text", ["plain"], [], { "char set": "utf-8" }),
    MediaTypeError,
    "disallowed characters",
  );
  assertThrows(
    () =>
      MediaType.get("text", ["plain"], [], {
        charset: "utf-8",
        CharSet: "ascii",
      }),
    MediaTypeError,
    "duplicate parameter",
  );
});

Deno.test("MediaType.fromString()", () => {
  const odt = MediaType.fromString("application/vnd.oasis.opendocument.text");
  assertStrictEquals(odt.type, "application");
  assertEquals(odt.subtype, ["vnd", "oasis", "opendocument", "text"]);
  assertEquals(odt.suffixes, []);
  assertEquals(odt.parameters, {});
  const xhtml = MediaType.fromString("application/xhtml+xml; charset=UTF8");
  assertStrictEquals(xhtml.type, "application");
  assertEquals(xhtml.subtype, ["xhtml"]);
  assertEquals(xhtml.suffixes, ["xml"]);
  assertEquals(xhtml.parameters, { charset: "utf-8" });
  // Interning:
  assertStrictEquals(
    odt,
    MediaType.get("application", [
      "Vnd",
      "Oasis",
      "OpenDocument",
      "Text",
    ]),
  );
  assertStrictEquals(
    xhtml,
    MediaType.get("Application", ["xhtml"], ["xml"], {
      CharSet: "utf-8",
    }),
  );
  // Invalid media types:
  assertThrows(() => MediaType.fromString("/plain"), MediaTypeError);
  assertThrows(() => MediaType.fromString("text /plain"), MediaTypeError);
  assertThrows(() => MediaType.fromString("text/"), MediaTypeError);
  assertThrows(
    () => MediaType.fromString("application/vnd.oasis.opendocument."),
    MediaTypeError,
  );
  assertThrows(() => MediaType.fromString("text/plain "), MediaTypeError);
  assertThrows(
    () => MediaType.fromString("application/vnd.ms-excel "),
    MediaTypeError,
  );
  assertThrows(
    () => MediaType.fromString("application/xhtml+"),
    MediaTypeError,
  );
  assertThrows(
    () => MediaType.fromString("application/xhtml+xml "),
    MediaTypeError,
  );
  assertThrows(
    () => MediaType.fromString("text/plain; =utf-8"),
    MediaTypeError,
    "Incorrect parameters",
  );
  assertThrows(
    () => MediaType.fromString("text/plain; char set=utf-8"),
    MediaTypeError,
    "Incorrect parameters",
  );
  assertThrows(
    () => MediaType.fromString("text/plain; CharSet=utf-8; charset=ascii"),
    MediaTypeError,
    "duplicate parameter",
  );
});

Deno.test("MediaType#withParameter()", () => {
  const txt = MediaType.fromString("text/plain");
  const txtUtf8 = MediaType.fromString("text/plain; charset=utf-8");
  const txtAscii = MediaType.fromString("text/plain; charset=ascii");
  assertStrictEquals(txt.withParameter("charset"), txt);
  assertStrictEquals(txt.withParameter("charset", null), txt);
  assertStrictEquals(txt.withParameter("charset", "utf-8"), txtUtf8);
  assertStrictEquals(txt.withParameter("CHARSET", "ascii"), txtAscii);
  assertStrictEquals(txtUtf8.withParameter("charset"), txt);
  assertStrictEquals(txtUtf8.withParameter("charset", null), txt);
  assertStrictEquals(txtUtf8.withParameter("charset", "ascii"), txtAscii);
  assertStrictEquals(
    txtUtf8.withParameter("foo", "bar"),
    MediaType.fromString("text/plain; charset=utf-8; foo=bar"),
  );
  assertThrows(
    () => txt.withParameter("invalid,name", "value"),
    MediaTypeError,
    "disallowed characters",
  );
});

Deno.test("MediaType#matches()", () => {
  const txt = MediaType.fromString("text/plain");
  const txtUtf8 = MediaType.fromString("text/plain; charset=utf-8");
  const txtAscii = MediaType.fromString("text/plain; charset=ascii");
  const html = MediaType.fromString("text/html");
  const htmlUtf8 = MediaType.fromString("text/html; charset=utf8");
  const atom = MediaType.fromString("application/atom+xml");
  const xhtml = MediaType.fromString("application/xhtml+xml");
  const vndXhtml = MediaType.fromString("application/vnd.foo.xhtml+xml");
  const types = [txt, txtUtf8, txtAscii, html, htmlUtf8, atom, xhtml, vndXhtml];
  // txt     txtUtf8 txtAsci html    htmlUtf atom    xhtml   vndXhtml
  // deno-fmt-ignore
  const truthTable = [
    [true,   false,  false,  false,  false,  false,  false,  false], // txt
    [true,   true,   false,  false,  false,  false,  false,  false], // txtUtf8
    [true,   false,  true,   false,  false,  false,  false,  false], // txtAscii
    [false,  false,  false,  true,   false,  false,  false,  false], // html
    [false,  false,  false,  true,   true,   false,  false,  false], // htmlUtf8
    [false,  false,  false,  false,  false,  true,   false,  false], // atom
    [false,  false,  false,  false,  false,  false,  true,   false], // xhtml
    [false,  false,  false,  false,  false,  false,  false,  true],  // vndXhtml
  ];
  for (let i = 0; i < types.length; i++) {
    for (let j = 0; j < types.length; j++) {
      assertStrictEquals(
        types[i].matches(types[j]),
        truthTable[i][j],
        `MediaType.fromString(${JSON.stringify(types[i].toString())}).matches(${
          JSON.stringify(types[j].toString())
        }) should be ${JSON.stringify(truthTable[i][j])}, but got ${
          JSON.stringify(types[i].matches(types[j]))
        }.`,
      );
      assertStrictEquals(types[i].matches(types[j]), truthTable[i][j]);
    }
  }
});

Deno.test("MediaType#toString()", () => {
  const odt = MediaType.get("application", [
    "Vnd",
    "Oasis",
    "OpenDocument",
    "Text",
  ]);
  assertStrictEquals(odt.toString(), "application/vnd.oasis.opendocument.text");
  const xhtml = MediaType.get("Application", ["xhtml"], ["xml"], {
    CharSet: "utf-8",
  });
  assertStrictEquals(xhtml.toString(), "application/xhtml+xml; charset=utf-8");
});

Deno.test("Deno.inspect(MediaType)", () => {
  const txt = MediaType.fromString("text/plain");
  const htmlUtf8 = MediaType.fromString("text/html; charset=utf8");
  const vndXhtml = MediaType.fromString("application/vnd.foo.xhtml+xml");
  assertEquals(Deno.inspect(txt), "MediaType(text/plain)");
  assertEquals(Deno.inspect(htmlUtf8), "MediaType(text/html; charset=utf-8)");
  assertEquals(
    Deno.inspect(vndXhtml),
    "MediaType(application/vnd.foo.xhtml+xml)",
  );
  assertEquals(
    Deno.inspect([txt, htmlUtf8]),
    "[ MediaType(text/plain), MediaType(text/html; charset=utf-8) ]",
  );
});

Deno.test("MediaTypeError()", () => {
  const e = new MediaTypeError();
  assertEquals(e.message, "");
  assertEquals(e.name, "MediaTypeError");
  const e2 = new MediaTypeError("error message");
  assertEquals(e2.message, "error message");
  assertEquals(e2.name, "MediaTypeError");
});
