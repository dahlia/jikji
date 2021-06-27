import { Content, ContentKey, ContentKeyError } from "./content.ts";

/**
 * Represents resources which have their own paths and consist of one or more
 * representations.  Each representation correspond a candidate of
 * content negotiation.
 */
export class Resource implements Iterable<Content> {
  readonly #path: URL;
  readonly #representations: Map<ContentKey, Content>;
  readonly #lastModified: Date;

  /**
   * Creates a new {@link Resource} instance.
   * @param path The unique path of the resource.  Even though it can be
   *             a string, its content should be a URL anyway.
   * @param representations Multiple representations of the resource.
   *                        Each representation must have its unique `key`,
   *                        and there must be at least one representation.
   * @throws {ContentKeyError} Thrown when there are duplicate keys for
   *                           `representations`.
   * @throws {ResourceError} Thrown when no content is in `representations`.
   */
  constructor(path: URL | string, representations: Iterable<Content>) {
    this.#path = new URL(path.toString(), path);
    Object.freeze(this.#path);
    this.#representations = new Map();
    this.#lastModified = new Date(0);
    for (const content of representations) {
      const key = content.key;
      if (this.#representations.has(key)) {
        throw new ContentKeyError(
          `There are duplicate keys for #representations: ${key.toString()}.`,
        );
      }
      this.#representations.set(key, content);
      if (this.#lastModified < content.lastModified) {
        this.#lastModified = content.lastModified;
      }
    }
    if (this.#representations.size < 1) {
      throw new ResourceError("At least one representation is required.");
    }
    Object.freeze(this.#representations);
    Object.freeze(this.#lastModified);
    Object.freeze(this);
  }

  /**
   * The unique path of the resource.  Note that every time it creates
   * a new instance to return so that mutation on it outside does not affect
   * to the {@link Resource} instance's internal state.
   */
  get path(): URL {
    return new URL(this.#path.toString(), this.#path);
  }

  /**
   * The last time the content was modified.  Note that every time it creates
   * a new instance to return so that mutation on it outside does not affect
   * to the {@link Resource} instance's internal state.
   */
  get lastModified(): Date {
    return new Date(this.#lastModified);
  }

  /** The number of representations in the resource. */
  get size(): number {
    return this.#representations.size;
  }

  /**
   * Checks if the resource has a representation for the given `key`.
   * @param key The content key to negotiate.
   * @returns `true` if the resource has it.  Otherwise `false`.
   */
  hasRepresentation(key: ContentKey): boolean {
    return this.#representations.has(key);
  }

  /**
   * Gets a representation by its content `key`.
   * @param key The content key to get.
   * @returns The content if the resource has a representation.
   *          Otherwise `null`.
   */
  getRepresentation(key: ContentKey): Content | null {
    return this.#representations.get(key) || null;
  }

  /**
   * Adds a representation.  Note that it does not manipulate in place, but
   * returns a distinct {@link Resource} instance with added a more
   * `representation`.
   * @param representation A representation to add.  Its content `key` must not
   *                       be a duplicate of any in the existing
   *                       representations.
   * @returns A distinct {@link Resource} instance with added a more
   *          `representation`.
   * @throws {ContentKeyError} Thrown when there is a duplicate key of
   *         the given `representation` in the existing `representations`.
   */
  addRepresentation(representation: Content): Resource {
    return new Resource(this.#path, [...this, representation]);
  }

  /**
   * Changes the {@link Resource}'s path.  Note that it does not manipulate
   * in place, but returns a distinct {@link Resource} instance with the new
   * `path`.
   * @param path A path to replace the resource's existing path.  Even though
   *             it can be a string, its content should be a URL anyway.
   * @returns A distinct {@link Resource} instance with the new `path`.
   */
  move(path: URL | string) {
    return new Resource(path, [...this]);
  }

  /**
   * Enumerates all #representations in the resource.
   * @returns The iterator which yields all #representations in the resource.
   *          The order is arbitrary.
   */
  [Symbol.iterator](): IterableIterator<Content> {
    return this.#representations.values();
  }

  [Deno?.customInspect ?? Symbol("Deno.customInspect")](): string {
    function indent(s: string): string {
      return "    " + s.replace(/\n/g, "\n    ");
    }
    const contents = [...this.#representations.values()];
    contents.sort((a, b) => a.key.toString() < b.key.toString() ? -1 : 1);
    const representations = contents
      .map((c) => indent(Deno.inspect(c)) + ",\n")
      .join("");
    return "Resource {\n" +
      `  path: ${Deno.inspect(this.path.toString())},\n` +
      `  size: ${Deno.inspect(this.size)},\n` +
      `  lastModified: ${Deno.inspect(this.lastModified)},\n` +
      `  representations: [\n${representations}  ]\n` +
      "}";
  }
}

/** Thrown when an invalid resource is tried to be made. */
export class ResourceError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ResourceError";
  }
}

export { Content, ContentKey, ContentKeyError };
export default Resource;
