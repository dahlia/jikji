/**
 * Represents tags for identifying languages.  See also RFC 5646.
 *
 * It guarantees all instances are interned and only single instance is made
 * for each language tag, which means, `===` operator can be used for testing
 * structural equality of two {@link LanguageTag} operands.
 * @copyright 2022 Hong Minhee
 * @license LGPL-3.0-only
 */
export class LanguageTag {
  /** Required set of permissions for using this class within Deno. */
  static readonly requiredPermissions: Deno.PermissionOptionsObject = {
    net: ["cdn.skypack.dev"],
  };

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
   * Lists all available reduced (i.e., less specific) language tags for the
   * given language tag.  For example, `en-Latn-US` has `en-Latn`, `en-US`, and
   * `en` as reduced tags.
   * @param containSelf Whether the reduced tags should contain the given
   *                    language tag itself.
   * @returns A list of reduced tags.  The most specific tag is listed first,
   *          and the most general tag is listed last.
   */
  *reduce(containSelf = false): Iterable<LanguageTag> {
    const scripts = this.script == null ? [null] : [this.script, null];
    const regions = this.region == null ? [null] : [this.region, null];
    for (const script of scripts) {
      for (const region of regions) {
        if (containSelf || this.script != script || this.region != region) {
          yield LanguageTag.get(this.language, script, region);
        }
      }
    }
  }

  static readonly #CLDR_LIKELY_SUBTAGS_URL =
    "https://cdn.skypack.dev/cldr-core/supplemental/likelySubtags.json";
  static #cldrLikelySubtags?: Record<string, string>;

  /**
   * Gets the most likely subtag according to Unicode CLDR (Likely Subtags in
   * Supplemental Data), if available.  For example, `ko` is likely to be
   * `ko-Kore-KR`, and `zh-TW` is likely to be `zh-Hant-TW`.
   * @returns The most likely subtag if available, otherwise it returns the
   *          original language tag.
   */
  async toLikelySubtag(): Promise<LanguageTag> {
    if (LanguageTag.#cldrLikelySubtags == null) {
      let data: Record<string, string>;
      try {
        const response = await fetch(LanguageTag.#CLDR_LIKELY_SUBTAGS_URL);
        const json = await response.json();
        data = json.supplemental.likelySubtags;
      } catch {
        data = {};
      }
      LanguageTag.#cldrLikelySubtags = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]),
      );
    }

    const tag = LanguageTag.#cldrLikelySubtags[this.toString().toLowerCase()];
    if (tag == null) return this;
    return LanguageTag.fromString(tag);
  }

  static readonly #CLDR_LOCALENAMES_URL_BASE =
    "https://cdn.skypack.dev/cldr-localenames-full/main/";

  private async *tryCldrUrls(
    file: string,
  ): AsyncIterable<[LanguageTag, string]> {
    const base = LanguageTag.#CLDR_LOCALENAMES_URL_BASE.replace(/\/$/, "");
    yield [this, `${base}/${this.toString()}/${file}`];

    const likelySubtag = await this.toLikelySubtag();
    const similarTags = likelySubtag.reduce(likelySubtag !== this);
    for (const l of similarTags) {
      if (l !== this) yield [l, `${base}/${l.toString()}/${file}`];
    }
  }

  static #cldrData: Map<
    LanguageTag,
    Record<string, Record<string, unknown> | undefined> | null
  > = new Map();

  private async fetchCldr(file: string): Promise<Record<string, unknown>> {
    const triedUrls: string[] = [];
    let data: Record<string, unknown> | undefined;
    for await (const [l, url] of this.tryCldrUrls(file)) {
      triedUrls.push(url);
      const cldrData = LanguageTag.#cldrData.get(l);
      if (cldrData != null && cldrData[file] != null) {
        data = cldrData[file];
      } else if (cldrData === null) {
        continue;
      } else {
        let json;
        try {
          const response = await fetch(url);
          json = await response.json();
        } catch {
          LanguageTag.#cldrData.set(l, null);
          continue;
        }

        const tag = l.toString();
        const main = json?.main[tag] != null
          ? json.main[tag]
          : Object.values(json.main)[0];
        data = main.localeDisplayNames;
        if (cldrData == null) {
          LanguageTag.#cldrData.set(l, { file: data });
        } else {
          cldrData[file] = data;
        }
      }

      break;
    }

    if (data == null) {
      throw new LanguageTagError(
        "There is no Unicode CLDR sheet for the language tag: " +
          `${this.toString()}.  Tried URLs are:\n  ${triedUrls.join("\n  ")}`,
      );
    }

    return data;
  }

  /**
   * Looks up the display name for the given language tag in this language
   * from the Unicode CLDR data.
   * @param language The language tag to look up.
   * @returns The display name for the given language tag.  If the given
   *          language tag is not found, `null` is returned.
   */
  async getLanguageName(
    language: string | LanguageTag,
  ): Promise<string | null> {
    language = typeof language == "string"
      ? LanguageTag.fromString(language)
      : language;
    const data = await this.fetchCldr("languages.json");
    const languages = data.languages as Record<string, string> | undefined;
    if (languages == null) return null;

    type Pattern =
      | "localePattern"
      | "localeSeparator"
      | "localeKeyTypePattern";
    const localeDisplayPattern = async (): Promise<Record<Pattern, string>> => {
      const data = await this.fetchCldr("localeDisplayNames.json");
      return data.localeDisplayPattern as Record<Pattern, string>;
    };
    function replace(pattern: string, a?: string, b?: string): string {
      return pattern.replace(
        /\{[01]\}/g,
        (p) => p === "{0}" ? `${a}` : `${b}`,
      );
    }

    let languageName: string | null = null;
    for (const reduced of language.reduce(true)) {
      const name = languages[reduced.toString()];
      if (name == null) continue;

      languageName = name;
      if (reduced == language) break;

      let variants: [] | [string] | [string, string] = [];
      if (language.region != null && reduced.region != language.region) {
        const territory = await this.getTerritoryName(language.region);
        if (territory != null) variants = [territory];
      }
      if (language.script != null && reduced.script != language.script) {
        const script = await this.getScriptName(language.script);
        if (script != null) variants = [script, ...variants];
      }

      const pattern = (await localeDisplayPattern()).localePattern;
      const generalName = languages[reduced.language];
      if (reduced.region != null) {
        const regionName = await this.getTerritoryName(reduced.region);
        if (
          regionName != null &&
          languageName === replace(pattern, generalName, regionName)
        ) {
          languageName = generalName;
          variants = variants[0] != null
            ? [variants[0], regionName]
            : [regionName];
        }
      } else if (reduced.script != null) {
        const scriptName = await this.getScriptName(reduced.script);
        if (
          scriptName != null &&
          languageName === replace(pattern, generalName, scriptName)
        ) {
          languageName = generalName;
          variants = variants[0] != null
            ? [scriptName, variants[0]]
            : [scriptName];
        }
      }

      if (variants.length == 2) {
        const separator = (await localeDisplayPattern()).localeSeparator;
        variants = [replace(separator, ...variants)];
      }

      if (variants.length == 1) {
        languageName = replace(pattern, languageName, variants[0]);
      }

      break;
    }

    return languageName;
  }

  /**
   * Looks up the display name of the given `territory` in this language
   * from the Unicode CLDR data.
   * @param territory The territory to look up.  The territory must be a valid
   *                  ISO 3166-1 alpha-2 code.
   * @returns The display name of the territory.  If the territory is not found,
   *          `null` is returned.
   */
  async getTerritoryName(territory: string): Promise<string | null> {
    territory = territory.toUpperCase();
    const data = await this.fetchCldr("territories.json");
    const territories = data.territories as Record<string, string> | undefined;
    return territories?.[territory] ?? null;
  }

  /**
   * Looks up the display name of the given `script` in this language
   * from the Unicode CLDR data.
   * @param script The script to look up.  The script must be a valid
   *               ISO 15924 code.
   * @returns The display name of the script, or `null` if it is unavailable
   *          from the Unicode CLDR data.
   */
  async getScriptName(script: string): Promise<string | null> {
    script = script[0].toUpperCase() + script.substr(1).toLowerCase();
    const data = await this.fetchCldr("scripts.json");
    const scripts = data?.scripts as Record<string, string> | undefined;
    return scripts?.[script] ?? null;
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

  [Symbol.for("Deno.customInspect")](): string {
    return `LanguageTag(${this.toString()})`;
  }
}

/** Thrown when an invalid language tag is tried to be made. */
export class LanguageTagError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "LanguageTagError";
  }
}

export default LanguageTag;
