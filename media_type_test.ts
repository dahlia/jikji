import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
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

Deno.test("MediaType.toString()", () => {
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
