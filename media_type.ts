/**
 * Represents IANA media types, formerly known as MIME types.
 *
 * It guarantees all instances are interned and only single instance is made
 * for each IANA media type, which means, `===` operator can be used for testing
 * structural equality of two {@link MediaType} operands.
 */
export class MediaType {
  /** A major media type, e.g., `text`, `image`, `application`. */
  readonly type: string;
  /**
   * A tree of media subtype, e.g., `plain`, `jpeg`, `vnd.ms-excel`.
   * Each node of tree is represented as an element of array,
   * e.g., `["vnd", "ms-excel"]`.
   */
  readonly subtype: [string, ...string[]];
  /** Zero or more subtype suffixes, e.g., `xml` from `image/svg+xml`. */
  readonly suffixes: string[];
  /**
   * Zero or more key-value pairs,
   * e.g., `charset` & `utf-8` from `text/html; charset=utf-8`.
   */
  readonly parameters: Record<string, string>;

  private constructor(
    type: string,
    subtype: [string, ...string[]],
    suffixes?: string[],
    parameters?: Record<string, string>,
  ) {
    const fields: Record<string, string | string[] | null | undefined> = {
      type,
      "node of subtype": subtype,
      suffix: suffixes,
    };
    for (const name in fields) {
      const f = fields[name];
      const vs = f == null ? [] : typeof f == "string" ? [f] : f;
      for (const v of vs) {
        if (v.match(/[/.+;\s]/)) {
          throw new MediaTypeError(
            `A ${name} cannot contains any whitespace, slashes, periods, ` +
              `plus, or semicolon: ${JSON.stringify(v)}.`,
          );
        } else if (v.length < 1) {
          throw new MediaTypeError(`A ${name} cannot be empty.`);
        }
      }
    }
    this.type = type.toLowerCase();
    const normalizedSubtype = subtype.map((s) => s.toLowerCase());
    this.subtype = [normalizedSubtype[0], ...normalizedSubtype.slice(1)];
    Object.freeze(this.subtype);
    this.suffixes = suffixes || [];
    Object.freeze(this.suffixes);
    this.parameters = parameters || {};
    Object.freeze(this.parameters);
    Object.freeze(this);
  }

  private static readonly interns: Record<string, MediaType> = {};

  /**
   * Gets a {@link MediaType} instance.
   * @param type A major media type, e.g., `text`, `image`, `application`.
   * @param subtype A tree of media subtype, e.g., `plain`, `jpeg`,
   *                `vnd.ms-excel`.  Each node of tree is represented as
   *                an element of array, e.g., `["vnd", "ms-excel"]`.
   * @param parameters Zero or more key-value pairs, e.g.,
   *                   `charset` & `utf-8` from `text/html; charset=utf-8`.
   * @returns A corresponding {@link MediaType} instance.
   * @throws {MediaTypeError} Thrown when any parameter is invalid.
   */
  static get(
    type: string,
    subtype: [string, ...string[]] | string,
    suffixes?: string[],
    parameters?: Record<string, string>,
  ): MediaType {
    if (typeof subtype == "string") {
      const split = subtype.split(".");
      if (split.length < 1 || split[0].trim() === "") {
        throw new MediaTypeError("A subtype cannot be empty.");
      }
      subtype = split as [string, ...string[]];
    }
    parameters = this.normalizeParameters(parameters);
    const encoding = parameters?.charset;
    if (encoding != null) {
      const normalized = new TextDecoder(encoding).encoding;
      if (encoding !== normalized) {
        parameters = { ...parameters, charset: normalized };
      }
    }
    const mediaType = new this(type, subtype, suffixes, parameters);
    const key = mediaType.toString();
    const interned = this.interns[key];
    return interned || (this.interns[key] = mediaType);
  }

  private static normalizeParameters(
    parameters?: Record<string, string> | null,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const attr in parameters) {
      if (attr.length < 1) {
        throw new MediaTypeError("Parameter names cannot be empty.");
      }
      const illegalChars = attr.match(/[^-!#$%&'*+.0-9<>A-Z^_`a-z{|}~]+/);
      if (illegalChars != null) {
        throw new MediaTypeError(
          `There are some disallowed characters ${
            JSON.stringify(illegalChars[0])
          } in a parameter name: ${JSON.stringify(attr)}.`,
        );
      }
      const a = attr.toLowerCase();
      if (normalized[a] == null) {
        normalized[a] = parameters[attr];
      } else {
        throw new MediaTypeError(
          `There are duplicate parameter names: ${
            JSON.stringify(a)
          }.  Note that parameter names are case-insensitive.`,
        );
      }
    }
    return normalized;
  }

  private static readonly PATTERN: RegExp =
    /^([^/.+;\s]+)\/([^/.+;\s]+)((?:\.[^/.+;\s]+)*)((\+[^/.+;\s]+)*)(\s*;.*)?$/;

  private static readonly PARAMETER_PATTERN: RegExp =
    /;\s*([-!#$%&'*+.0-9<>A-Z^_`a-z{|}~]+)\s*=\s*("([^"\\\s]| |\\.)*"|[^()<>@,;:\\"\/\[\]?=\s]+)(?=;|$)/g;

  /**
   * Parses an IANA media type string.
   * @param mediaType An IANA media type.
   * @returns A corresponding {@link MediaType} instance.
   * @throws {MediaTypeError} Thrown when the given argument is not a valid
   *         IANA media type.
   */
  static fromString(mediaType: string): MediaType {
    const match = this.PATTERN.exec(mediaType);
    if (match == null) {
      throw new MediaTypeError(
        `Not a correct IANA media type string: ${JSON.stringify(mediaType)}.`,
      );
    }
    const subtype: [string, ...string[]] = [
      match[2],
      ...match[3].split(".").slice(1),
    ];
    const suffixes = match[5] == null ? [] : match[5].split("+").slice(1);
    const paramMatches = match[6] == null
      ? []
      : [...match[6].matchAll(this.PARAMETER_PATTERN)];
    if (match[6] != null && paramMatches.length < 1 && match[6].trim() !== "") {
      throw new MediaTypeError(
        `Incorrect parameters: ${JSON.stringify(match[6])}.`,
      );
    }
    const params: Record<string, string> = {};
    for (const paramMatch of paramMatches) {
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2].startsWith('"')
        ? this.unquoteParameterValue(paramMatch[2])
        : paramMatch[2];
      params[paramName] = paramValue;
    }
    return this.get(match[1], subtype, suffixes, params);
  }

  private static unquoteParameterValue(quoted: string): string {
    // Assuming quoted starts and ends with a pair of `"`s.
    const bare = quoted.substr(1, quoted.length - 2);
    return bare.replace(/\\(.)/g, "$1");
  }

  /**
   * Turns a media type object into an IANA media type string.
   * @returns A string formatted as IANA media type.
   */
  toString(): string {
    const suffixes = this.suffixes.map((s) => `+${s}`).join("");
    const params = Object.entries(this.parameters)
      .sort((a, b) => a[0] == b[0] ? 0 : a[0] < b[0] ? -1 : 1)
      .map((kv) => `; ${kv[0]}=${MediaType.escapeParameterValue(kv[1])}`)
      .join("");
    return `${this.type}/${this.subtype.join(".")}${suffixes}${params}`;
  }

  private static readonly BARE_PARAMETER_VALUE_PATTERN: RegExp =
    /^[^()<>@,;:\\"\/\[\]?=]+$/;

  private static escapeParameterValue(value: string): string {
    if (value.match(this.BARE_PARAMETER_VALUE_PATTERN)) {
      return value;
    }

    return `"${value.replace(/([\s"\\])/g, "\\$1")}"`;
  }
}

/** Thrown when an invalid IANA media type is tried to be made. */
export class MediaTypeError extends Error {
}

export default MediaType;
