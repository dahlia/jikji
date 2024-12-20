/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import { LanguageTag, LanguageTagError } from "./language_tag.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";

/** The content metadata.  Usually extracted from front matter. */
export type ContentMetadata = Record<string, unknown>;

/** The content body.  It can be either a Unicode string or a byte array. */
export type ContentBody = string | Uint8Array;

/** The asynchronous function to load content body and optionally metadata. */
export type ContentLoader = () => Promise<
  | ContentBody
  | [ContentBody]
  | [ContentBody, ContentMetadata | undefined]
>;

/**
 * The content with metadata.  It can be a source content, or also can be
 * a target content, or even can be an intermediate content.  Although it
 * is in-memory representation, its body and metadata are lazily loaded
 * on memory when it is actually necessary.
 *
 * Note that a content in itself is unaware of its filename or URI.
 * Names are given to resources.
 */
export class Content {
  #body?: ContentBody;
  readonly #loader: ContentLoader;
  readonly #lastModified: Date;
  readonly #metadata: ContentMetadata;

  /** The media type of the content. */
  readonly type: MediaType;
  /** An optional hint of the content's natural language. */
  readonly language: LanguageTag | null;
  readonly eTag: string | null;

  /**
   * Creates a new {@link Content} instance.
   * @param loader A function to load the actual content body and metadata.
   *               It can be invoked a while after the instance is created,
   *               or even can be never invoked if it is unnecessary.
   *               It also can be just a {@link string} or a {@link Uint8Array}.
   * @param type The media type of the content.  If it is a string,
   *             it is interpreted as an IANA media type (a.k.a. MIME type).
   * @param language An optional hint of the content's natural language.
   *                 If it is a string, it is interpreted as an RFC 5646
   *                 language tag.
   * @param lastModified An optional last modification time.  The current time
   *                     is set if omitted.
   * @param metadata Additional metadata about the content.  The entries can
   *                 be partly overwritten by metadata that `loader` returns.
   * @param eTag Extra validator to determine if cache should be invalidated.
   *             It's optional and only required when `lastModified` is not
   *             enough.
   * @throws {MediaTypeError} Thrown when the `type` is an invalid IANA media
   *                          type.
   * @throws {LanguageTagError} Thrown when the `language` is an invalid
   *                            RFC 5646 language tag string.
   */
  constructor(
    loader: ContentLoader | ContentBody,
    type: MediaType | string,
    language?: LanguageTag | string | null,
    lastModified?: Date | null,
    metadata?: ContentMetadata,
    eTag?: string | null,
  ) {
    if (typeof loader == "string" || loader instanceof Uint8Array) {
      const body = loader instanceof Uint8Array ? loader.slice(0) : loader;
      this.#body = body;
      loader = () => Promise.resolve(body);
    }
    this.#loader = loader;
    this.type = typeof type == "string" ? MediaType.fromString(type) : type;
    this.language = typeof language == "string"
      ? LanguageTag.fromString(language)
      : language || null;
    this.#lastModified = lastModified == null
      ? new Date()
      : new Date(lastModified);
    this.#metadata = { ...metadata };
    this.eTag = eTag || null;
  }

  private async load(): Promise<ContentBody> {
    if (this.#body != null) return this.#body;
    const loaded = await this.#loader();
    if (typeof loaded == "string" || loaded instanceof Uint8Array) {
      this.#body = loaded instanceof Uint8Array ? loaded.slice(0) : loaded;
      return this.#body;
    }

    this.#body = loaded[0] instanceof Uint8Array
      ? loaded[0].slice(0)
      : loaded[0];
    if (loaded.length > 1 && loaded[1] != null) {
      Object.assign(this.#metadata, loaded[1]);
    }
    return this.#body;
  }

  /**
   * Gets the actual content body.  If the body has never been loaded on memory
   * yet, it invokes the loader function, which usually does I/O under
   * the hood.  The body is cached on memory after it is loaded once.
   * @returns The actual content body.  Note that mutating this value outside
   *          does not affect the {@link Content} instance's internal state,
   *          because it makes a copy of the internal buffer every time.
   */
  async getBody(): Promise<ContentBody> {
    const body = await this.load();
    return typeof body == "string" ? body : body.slice(0);
  }

  /**
   * Gets additional metadata about the content.  If the metadata has never
   * been loaded on memory yet, it invokes the loader function, which usually
   * does I/O under the hood.  The metadata is cached on memory after it is
   * loaded once.
   * @returns The actual content metadata.  Note that mutating this object
   *          outside does not affect the {@link Content} instance's internal
   *          state, because it makes a copy of the internal object every time.
   */
  async getMetadata(): Promise<ContentMetadata> {
    await this.load();
    return { ...this.#metadata };
  }

  /**
   * The text encoding of the content, e.g., `"utf-8"`.  It can be `null` when
   * it is unknown.
   */
  get encoding(): string | null {
    const typeParams = this.type.parameters;
    return typeParams.charset || null;
  }

  /** The key to tell apart representation candidates. */
  get key(): ContentKey {
    return ContentKey.get(this.type, this.language);
  }

  /**
   * The last time the content was modified.  Note that every time it creates
   * a new instance to return so that mutation on it outside does not affect
   * to the {@link Content} instance's internal state.
   */
  get lastModified(): Date {
    return new Date(this.#lastModified);
  }

  /**
   * Makes a derivation of the content by modifying some fields and leaving
   * rest.  If every field is modified it does not differ from creating
   * a completely new content using {@link Content} constructor.  If no field
   * is modified it returns the same instance.
   * @param fields Fields to modify.  Unspecified fields are left unmodified.
   * @returns A new distinct {@link Content} instance derived from the content.
   *          If no fields are modified it can return the same {@link Content}
   *          instance.
   */
  replace(fields: ContentFields): Content {
    const body = fields.body;
    const metadata = fields.metadata;
    if (
      body == null &&
      fields.type == null &&
      typeof fields.language == "undefined" &&
      fields.lastModified == null &&
      metadata == null &&
      typeof fields.eTag == "undefined"
    ) {
      return this;
    }
    return new Content(
      async () => {
        return [
          body == null
            ? await this.getBody()
            : typeof body == "function"
            ? await body()
            : body,
          // deno-fmt-ignore
          metadata == null
            ? await this.getMetadata()
            : typeof metadata == "function"
            ? await metadata(await this.getMetadata())
            : metadata,
        ];
      },
      fields.type ?? this.type,
      typeof fields.language == "undefined" ? this.language : fields.language,
      fields.lastModified ?? this.lastModified,
      undefined,
      typeof fields.eTag == "undefined" ? this.eTag : fields.eTag,
    );
  }

  /**
   * Checks if the {@link Content} satisfies the given `filter`.
   * @param filter The criteria to check.  If it's omitted (`undefined`)
                   `true` is returned.
   * @returns `true` if the {@link Content} satisfies the given `filter`.
              `false` otherwise.
   */
  matches(filter?: ContentFilter): boolean {
    if (filter == null) return true;
    if (filter?.negate) return !this.matches({ ...filter, negate: false });
    if (filter.type != null) {
      const types = (filter.type instanceof Array ? filter.type : [filter.type])
        .map((t) => typeof t == "string" ? MediaType.fromString(t) : t);
      if (!types.some((t) => this.type.matches(t))) return false;
    }
    if (filter.exactType != null) {
      const exactTypes = (filter.exactType instanceof Array
        ? filter.exactType
        : [filter.exactType]).map((t) =>
          typeof t == "string" ? MediaType.fromString(t) : t
        );
      if (exactTypes.indexOf(this.type) < 0) {
        return false;
      }
    }
    if (typeof filter.language != "undefined") {
      const languages =
        (filter.language instanceof Array ? filter.language : [filter.language])
          .map((l) => typeof l == "string" ? LanguageTag.fromString(l) : l);
      const matchesAny = languages.some((l) =>
        this.language == null
          ? l == null
          : l != null && this.language.matches(l)
      );
      if (!matchesAny) return false;
    }
    if (typeof filter.exactLanguage != "undefined") {
      const exactLanguages = (filter.exactLanguage instanceof Array
        ? filter.exactLanguage
        : [filter.exactLanguage]).map((l) =>
          typeof l == "string" ? LanguageTag.fromString(l) : l
        );
      const matchesAny = exactLanguages.some((l) =>
        l === this.language
      );
      if (!matchesAny) return false;
    }
    return true;
  }

  [Symbol.for("Deno.customInspect")](): string {
    const body = this.#body;
    return "Content {\n" +
      `  body: ${body == null ? "(unloaded)" : Deno.inspect(body)},\n` +
      `  type: ${Deno.inspect(this.type)},\n` +
      `  language: ${Deno.inspect(this.language)},\n` +
      `  lastModified: ${Deno.inspect(this.lastModified)},\n` +
      `  metadata: ${
        body == null ? "(unloaded)" : Deno.inspect(this.#metadata)
      },\n` +
      `  eTag: ${Deno.inspect(this.eTag)}\n` +
      "}";
  }
}

/**
 * Represents fields of {@link Content} to modify some of them.  Omitted fields
 * (`undefined` fields) mean that these fields remain unchanged.
 */
export interface ContentFields {
  /**
   * A new body of content, or a function to load a new content of content.
   */
  body?: ContentBody | (() => Promise<ContentBody>) | (() => ContentBody);

  /** A new media type of content. */
  type?: MediaType | string;

  /**
   * A new language of content.  Note that `null` means to set the language
   * to `null`, which differs from `undefined`, which means to maintain
   * the language as it is.
   */
  language?: LanguageTag | string | null;

  /** A new timestamp when content was lastly modified. */
  lastModified?: Date;

  /**
   * New metadata of content, or a function to load new metadata of content.
   */
  metadata?:
    | ContentMetadata
    | ((metadata: ContentMetadata) => Promise<ContentMetadata>)
    | ((metadata: ContentMetadata) => ContentMetadata);

  /**
   * New ETag validator of content.
   */
  eTag?: string | null;
}

/**
 * A pair of {@link MediaType} and {@link LanguageTag}.
 *
 * It guarantees all instances are interned and only single instance is made
 * for each pair, which means, `===` operator can be used for testing
 * structural equality of two {@link ContentKey} operands.
 */
export class ContentKey {
  /** A media type. */
  readonly type: MediaType;
  /** An optional language tag. */
  readonly language: LanguageTag | null;

  private constructor(type: MediaType, language: LanguageTag | null) {
    this.type = type;
    this.language = language || null;
    Object.freeze(this);
  }

  private static interns: Record<string, ContentKey> = {};

  /**
   * Gets a {@link ContentKey} instance.
   * @param type A media type.  If it is a string, it is interpreted as an IANA
   *             media type (a.k.a. MIME type).
   * @param language An optional language tag.  If it is a string,
   *                 it is interpreted as an RFC 5646 language tag.
   * @returns A corresponding {@link ContentKey} instance.
   * @throws {MediaTypeError} Thrown when the `type` is an invalid IANA media
   *                          type.
   * @throws {LanguageTagError} Thrown when the `language` is an invalid
   *                            RFC 5646 language tag string.
   */
  static get(type: MediaType | string, language?: LanguageTag | string | null) {
    if (typeof type == "string") {
      type = MediaType.fromString(type);
    }
    if (typeof language == "string") {
      language = LanguageTag.fromString(language);
    }
    language = language || null;
    const key = `${type.toString()}\x00${language?.toString() || ""}`;
    return this.interns[key] || (this.interns[key] = new this(type, language));
  }

  toString(): string {
    let s = `ContentKey { type: ${JSON.stringify(this.type.toString())}`;
    if (this.language != null) {
      s += `, language: ${JSON.stringify(this.language.toString())}`;
    }
    s += " }";
    return s;
  }
}

/**
 * Thrown when a {@link ContentKey} does not exist or there are duplicate
 * {@link ContentKey}s.
 */
export class ContentKeyError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ContentKeyError";
  }
}

/**
 * Represents functions to determine whether to filter out a {@link Content}
 * or not.
 * @param content A content to be determined if it is filtered or not.
 * @returns `true` means to remain the given `content`, and `false` means to
 *          exclude it.
 */
export type ContentPredicate = (content: Content) => boolean;

/**
 * Represents criteria on {@link Content}s.  Each field represents a criterium,
 * and a {@link Content} satisfies a filter when it *all* criteria (fields) in
 * the filter are satisfied.
 *
 * Omitted (`undefined`) fields are satisfied for any {@link Content}.
 */
export interface ContentFilter {
  /**
   * Negates the filter.  If turned on, the filter is negated, which means
   * to exclude {@link Content}s that satisfy the filter.
   *
   * Turned off by default.
   */
  negate?: boolean;

  /**
   * Filters out {@link Content}s having `type`s that don't match to this.
   * This use {@link MediaType.matches} method for comparison under the hood,
   * which means it does not compare parameters if it lacks parameters.
   *
   * If an array is given, the filter is satisfied when any of the given
   * media types matches to the {@link Content}'s `type`.
   */
  type?: MediaType | string | (MediaType | string)[];

  /**
   * Similar to {@link type} filter, except it does exact match, which means
   * is is sensitive to {@link MediaType#parameters} unlike {@link type} filter.
   */
  exactType?: MediaType | string | (MediaType | string)[];

  /**
   * Filters out {@link Content}s having incompatible `language`s with this.
   * If `null` is given, it means to leave only {@link Content}s having
   * no `language`.
   *
   * This use {@link LanguageTag.matches} method for comparison under the hood.
   *
   * If an array is given, the filter is satisfied when any of the given
   * language tags matches to the {@link Content}'s `language`.
   */
  language?: LanguageTag | string | null | (LanguageTag | string | null)[];

  /** Similar to {@link language} filter, except it does exact match. */
  exactLanguage?: LanguageTag | string | null | (LanguageTag | string | null)[];
}

/**
 * Represents any kind of content criterion.  `undefined` means to include
 * the content.
 */
export type ContentCriterion = ContentFilter | ContentPredicate | undefined;

/**
 * Turns any kind of {@link ContentCriterion} into an equivalent
 * {@link ContentPredicate} function.
 * @param criterion Any kind of {@link ContentCriterion} to turn into
 *                  a {@link ContentPredicate} function.
 * @returns A predicate function equivalent to the given content `criterion`.
 */
export function toContentPredicate(
  criterion: ContentCriterion,
): ContentPredicate {
  if (criterion instanceof Function) return criterion;
  return (content: Content) => content.matches(criterion);
}

export default Content;
export { LanguageTag, LanguageTagError, MediaType, MediaTypeError };
