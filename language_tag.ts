/**
 * Represents tags for identifying languages.  See also RFC 5646.
 *
 * It guarantees all instances are interned and only single instance is made
 * for each language tag, which means, `===` operator can be used for testing
 * structural equality of two {@link LanguageTag} operands.
*/
export class LanguageTag {
  /** An ISO 639 code which consists of two or three letters. */
  readonly language: string;
  /** An ISO 15924 code which consists of four letters. */
  readonly script: string | null;
  /** An ISO 3166-1 code which consists of two or three letters. */
  readonly region: string | null;

  private constructor(
    language: string,
    script?: string | null,
    region?: string | null,
  ) {
    if (!language.match(/^[A-Za-z]{2,3}$/)) {
      throw new LanguageTagError(
        "A language must be 2-or-3-letter ISO 639 code.",
      );
    } else if (script != null && !script.match(/^[A-Za-z]{4}$/)) {
      throw new LanguageTagError("A script must be 4-letter ISO 15924 code.");
    } else if (region != null && !region.match(/^[A-Za-z]{2,3}$/)) {
      throw new LanguageTagError(
        "A region must be 2-or-3-letter ISO 3166-1 code.",
      );
    }
    this.language = language.toLowerCase();
    this.script = script?.toLowerCase() || null;
    this.region = region?.toLowerCase() || null;
    Object.freeze(this);
  }

  private static readonly interns: Record<string, LanguageTag> = {};

  /**
   * Gets a {@link LanguageTag} instance.
   * @param language An ISO 639 code which consists of two or three letters.
   * @param script An ISO 15924 code which consists of four letters.
   * @param region An ISO 3166-1 code which consists of two or three letters.
   * @returns A corresponding {@link LanguageTag} instance.
   * @throws {LanguageTagError} Thrown when any parameter is invalid.
   */
  static get(
    language: string,
    script?: string | null,
    region?: string | null,
  ): LanguageTag {
    const langTag = new this(language, script, region);
    const key = langTag.toString();
    const interned = this.interns[key];
    return interned || (this.interns[key] = langTag);
  }

  private static readonly PATTERN: RegExp =
    /^([A-Za-z]{2,3})(-([A-Za-z]{4}))?(-([A-Za-z]{2,3}))?$/;

  /**
   * Parses an RFC 5646 language tag string.
   * @param tagString An RFC 5646 language tag.
   * @returns A corresponding {@link LanguageTag} instance.
   * @throws {LanguageTagError} Thrown when the given argument is not a valid
   *         RFC 5646 language tag.
   */
  static fromString(tagString: string): LanguageTag {
    const fullTag = this.PATTERN.exec(tagString);
    if (fullTag == null) {
      throw new LanguageTagError(
        `Not a correct language tag string: ${JSON.stringify(tagString)}.`,
      );
    }
    return this.get(fullTag[1], fullTag[3], fullTag[5]);
  }

  /**
   * Checks if the language tag instance shares some parts in common with
   * the operand.  The operand is treated as a pattern, which means if some
   * fields are empty these are treated as wildcard.  For example:
   *
   * - `ko-KR` matches to `ko-KR`
   * - `ko-KR` matches to `ko`
   * - `ko-KR` does not match to `ko-Kore`
   * - `ko-KR` does not match to `ko-KP`
   * - `zh-Hant-HK` matches to `zh-Hant-HK`
   * - `zh-Hant-HK` matches to `zh-HK`
   * - `zh-Hant-HK` matches to `zh-Hant`
   * - `zh-Hant-HK` matches to `zh`
   * - `zh-Hant-HK` does not match to `zh-Hant-TW`
   * - `zh-Hant-HK` does not match to `zh-Hans-HK`
   * - `zh-Hant-HK` does not match to `en`
   * @param language The language pattern.
   * @returns Whether two language tags are compatible.
   * @throws {LanguageTagError} Thrown when the given argument is a string which
   *         is not a valid RFC 5646 language tag.
   */
  matches(language: LanguageTag | string): boolean {
    const pattern = typeof language == "string"
      ? LanguageTag.fromString(language)
      : language;
    return this === pattern ||
      this.language === pattern.language &&
        (pattern.script == null || this.script === pattern.script) &&
        (pattern.region == null || this.region === pattern.region);
  }

  /**
   * Turns a language tag object into an RFC 5646 string.
   * @returns A string formatted as RFC 5646.
   */
  toString(): string {
    return [
      this.language,
      this.script && `${this.script[0].toUpperCase()}${this.script.substr(1)}`,
      this.region?.toUpperCase(),
    ].filter((t) => t != null).join("-");
  }

  [Deno?.customInspect ?? Symbol("Deno.customInspect")](): string {
    return `LanguageTag(${this.toString()})`;
  }
}

/** Thrown when an invalid language tag is tried to be made. */
export class LanguageTagError extends Error {
}

export default LanguageTag;
