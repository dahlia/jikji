import { LanguageTag, LanguageTagError } from "./language_tag.ts";
import { MediaType, MediaTypeError } from "./media_type.ts";

/**
 * The content with metadata.  It can be a source content, or also can be
 * a target content, or even can be an intermediate content.  Although it
 * is in-memory representation, its body is lazily loaded on memory when it
 * is actually necessary.
 *
 * Note that a content in itself is unaware of its filename or URI.
 * Names are given to resources.
 */
export class Content {
  #body?: string | Uint8Array;
  #getBody: () => Promise<string | Uint8Array>;
  readonly #lastModified: Date;

  /** The media type of the content. */
  readonly type: MediaType;
  /** An optional hint of the content's natural language. */
  readonly language: LanguageTag | null;
  /** Additional metadata about the content. */
  readonly metadata: Record<string, unknown>;

  /**
   *
   * @param bodyGetter A function to load the actual content body.
   *                   It can be invoked a while after the instance is created,
   *                   or even can be never invoked if it is unnecessary.
   *                   It also can be just a {@link string} or
   *                   a {@link Uint8Array}.
   * @param type The media type of the content.  If it is a string,
   *             it is interpreted as an IANA media type (a.k.a. MIME type).
   * @param language An optional hint of the content's natural language.
   *                 If it is a string, it is interpreted as an RFC 5646
   *                 language tag.
   * @param lastModified An optional last modification time.  The current time
   *                     is set if omitted.
   * @param metadata Additional metadata about the content.
   * @throws {MediaTypeError} Thrown when the `type` is an invalid IANA media
   *                          type.
   * @throws {LanguageTagError} Thrown when the `language` is an invalid
   *                            RFC 5646 language tag string.
   */
  constructor(
    bodyGetter: (() => Promise<string | Uint8Array>) | string | Uint8Array,
    type: MediaType | string,
    language?: LanguageTag | string | null,
    lastModified?: Date | null,
    metadata?: Record<string, unknown> | null,
  ) {
    if (typeof bodyGetter == "string" || bodyGetter instanceof Uint8Array) {
      const body = bodyGetter;
      this.#body = body;
      bodyGetter = () => Promise.resolve(body);
    }
    this.#getBody = bodyGetter;
    this.type = typeof type == "string" ? MediaType.fromString(type) : type;
    this.language = typeof language == "string"
      ? LanguageTag.fromString(language)
      : language || null;
    this.#lastModified = lastModified == null
      ? new Date()
      : new Date(lastModified);
    this.metadata = metadata || {};
    Object.freeze(this.metadata);
  }

  /**
   * Gets the actual content body.  If the body has never been loaded on memory
   * yet, it invokes the memory getter function, which usually does I/O under
   * the hood.  The body is cached on memory after it is loaded once.
   * @returns The actual content body.
   */
  async getBody(): Promise<string | Uint8Array> {
    return this.#body || (this.#body = await this.#getBody());
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
}

export default Content;
export { LanguageTag, LanguageTagError, MediaType, MediaTypeError };
