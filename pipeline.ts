import map from "https://esm.sh/@async-generators/map@0.1.0";
import filter from "https://esm.sh/@async-generators/filter@0.1.1";
import { MediaType } from "./media_type.ts";
import { LanguageTag } from "./language_tag.ts";
import { Content, ContentFields, ContentFilter } from "./content.ts";
import { Resource } from "./resource.ts";

/**
 * Represents functions to transform a {@link Resource} into another
 * {@link Resource}.
 * @param resource A resource to be transformed.
 * @returns A transformed resource.
 */
export type ResourceTransformer = (resource: Resource) => Resource;

/**
 * Represents functions to determine whether to filter out a {@link Resource}
 * or not.
 * @param resource A resource to be determined if it is filtered or not.
 * @returns `true` means to remain the given `resource`, and `false` means to
 *          exclude it.
 */
export type ResourcePredicate = (resource: Resource) => boolean;

/**
 * Represents functions to transform a {@link URL} into another {@link URL}.
 * @param path A URL to be transformed.
 * @returns A transformed URL.
 */
export type PathTransformer = (path: URL) => URL;

/**
 * Represents functions to transform a {@link Content} into another
 * {@link Content}.
 * @param content A content to be transformed.
 * @returns A transformed content.
 */
export type ContentTransformer = (content: Content) => Content;

/**
 * Stream of multiple #resources with transformation.  The whole process of
 * build is based on this.
 */
export class Pipeline implements AsyncIterable<Resource> {
  readonly #resources: AsyncIterable<Resource>;
  #buffer?: Resource[];

  /**
   * Creates a new pipeline with the given asynchronous iterable of
   * {@link Resource}s.
   * @param resources An iterable or asynchronous iterable of {@link Resource}s.
   *                  As {@link Pipeline} objects in themselves are also
   *                  asynchronous iterable, these can be passed here.
   */
  constructor(resources: AsyncIterable<Resource> | Iterable<Resource>) {
    this.#resources = Symbol.asyncIterator in resources
      ? resources as AsyncIterable<Resource>
      : toAsyncIterable(resources as Iterable<Resource>);
    if (resources instanceof Array) {
      this.#buffer = resources;
    }
    Object.freeze(this);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Resource> {
    if (this.#buffer == null) {
      const buffer: Resource[] = [];
      for await (const resource of this.#resources) {
        buffer.push(resource);
        yield resource;
      }
      this.#buffer = buffer;
    } else {
      yield* this.#buffer;
    }
  }

  /**
   * Transforms the {@link Resource}s in the pipeline, and returns a distinct
   * pipeline.  Note that this does not mutate the pipeline in-place.
   *
   * To transform {@link Content}s or {@link Resource}s' paths instead,
   * use {@link transform} or {@link move} higher-order functions.
   * @param transformers A resource transformer.
   * @returns A distinct pipeline with transformed {@link Resource}s.
   */
  map(...transformers: ResourceTransformer[]): Pipeline {
    let resources: AsyncIterable<Resource> = this[Symbol.asyncIterator]();
    for (const transformer of transformers) {
      resources = map(resources, transformer);
    }
    return new Pipeline(resources);
  }

  /**
   * Remains only {@link Resource}s satisfying all given `predicates` in
   * the pipeline, and returns a distinct pipeline with only remained
   * {@link Resource}s.  Note that this does not mutate the pipeline in-place.
   * @param predicates One or more predicate functions that should be all
   *                   satisfied.
   * @returns A distinct pipeline with only remained {@link Resource}s, which
   *          satisfy all given `predicates`.
   */
  filter(...predicates: ResourcePredicate[]): Pipeline {
    let resources: AsyncIterable<Resource> = this[Symbol.asyncIterator]();
    for (const pred of predicates) {
      resources = filter(resources, pred);
    }
    return new Pipeline(resources);
  }

  /**
   * Executes a provided `callback` function once for each {@link Resource}.
   * Unlike {@link map} method, this returns a promise resolving nothing.
   * @param callback A callback function to be invoked with each
   *                 {@link Resource}, and its index.
   */
  async forEach(
    callback:
      | ((resource: Resource, index: number) => Promise<void>)
      | ((resource: Resource, index: number) => void)
      | ((resource: Resource) => Promise<void>)
      | ((resource: Resource) => void),
  ): Promise<void> {
    let i = 0;
    const promises: Promise<void>[] = [];
    for await (const resource of this) {
      const p = callback(resource, i++);
      if (p instanceof Promise) {
        promises.push(p);
      }
    }

    await Promise.all(promises);
  }

  /**
   * Transforms paths of all {@link Resource}s in the {@link Pipeline} into
   * other paths, and returns a distinct {@link Pipeline} with paths.
   * @param transformer A function transforming a path into other one.
   * @returns A distinct pipeline with `path`-transformed {@link Resource}s.
   */
  move(transformer: PathTransformer): Pipeline {
    return this.map(move(transformer));
  }

  /**
   * Transforms {@link Content}s of all {@link Resource}s in
   * the {@link Pipeline} into other {@link Content}s, and returns a distinct
   * {@link Pipeline} with transformed {@link Content}s.
   *
   * In order to add transformed {@link Contents} with maintaining existing
   * {@link Content}s instead of replacing them, use {@link Pipeline#diversify}
   * method instead.
   * @param transformer A content transformer to apply to {@link Content}s in
   *                    {@link Resource}s.
   * @param filter An optional filter to transform {@link Content}s.
   *               {@link Content}s that do not satisfy the filter will not
   *               be transformed, but will be as these are.
   * @returns A distinct pipeline with transformed {@link Content}s.
   */
  transform(
    transformer: ContentTransformer,
    filter?: ContentFilter | ((content: Content) => boolean),
  ): Pipeline {
    return this.map(transform(transformer, filter));
  }

  /**
   * Similar to {@link Pipeline#transform}, except that it does not replace
   * existing {@link Content}s in {@link Resource}s, but adds transformed
   * {@link Content}s with maintaining existing {@link Content}s instead.
   * @param transformer A content transformer to apply to {@link Content}s in
   *                    {@link Resource}s.
   * @param filter An optional filter to transform {@link Content}s.
   *               {@link Content}s that do not satisfy the filter will not
   *               be transformed.
   * @returns A distinct pipeline with transformed {@link Content}s.
   */
  diversify(
    transformer: ContentTransformer,
    filter?: ContentFilter | ((content: Content) => boolean),
  ): Pipeline {
    return this.map(diversify(transformer, filter));
  }
}

/**
 * Turns an iterable into an async iterable.
 * @param iterable An iterable to turn into an async iterable.
 * @returns The corresponding async iterable.
 */
async function* toAsyncIterable<T>(iterable: Iterable<T>): AsyncIterable<T> {
  yield* iterable;
}

/**
 * Turns a {@link PathTransformer} into a {@link ResourceTransformer}.
 *
 * Designed to work with {@link Pipeline#map} method.
 * @param transformer A path transformer to turn into
 *                    a {@link ResourceTransformer}.
 * @returns A resource transformer turned from the given path transformer.
 */
export function move(transformer: PathTransformer): ResourceTransformer {
  return (resource: Resource): Resource =>
    resource.move(transformer(resource.path));
}

/**
 * Turns a {@link ContentTransformer} into a {@link ResourceTransformer}.
 *
 * In order to add transformed {@link Contents} with maintaining existing
 * {@link Content}s instead of replacing them, use {@link diversify} function
 * instead.
 *
 * Designed to work with {@link Pipeline#map} method.
 * @param transformer A content transformer to apply to {@link Content}s in
 *                    {@link Resource}s.
 * @param filter An optional filter to transform {@link Content}s.
 *               {@link Content}s that do not satisfy the filter will not
 *               be transformed, but will be as these are.
 * @returns A resource transformer turned from the given content transformer.
 */
export function transform(
  transformer: ContentTransformer,
  filter?: ContentFilter | ((content: Content) => boolean),
): ResourceTransformer {
  function* transformRepresentations(resource: Resource) {
    for (const repr of resource) {
      const inCriteria = filter == null ||
        (typeof filter == "function"
          ? filter(repr)
          : repr.matches(filter as ContentFilter));
      yield inCriteria ? transformer(repr) : repr;
    }
  }
  return (resource: Resource): Resource =>
    new Resource(resource.path, transformRepresentations(resource));
}

/**
 * Similar to {@link transform}, except that it does not replace existing
 * {@link Content}s in {@link Resource}s, but adds transformed {@link Content}s
 * with maintaining existing {@link Content}s instead.
 *
 * Designed to work with {@link Pipeline#map} method.
 * @param transformer A content transformer to apply to {@link Content}s in
 *                    {@link Resource}s.
 * @param filter An optional filter to transform {@link Content}s.
 *               {@link Content}s that do not satisfy the filter will not
 *               be transformed.
 * @returns A resource transformer which diversifies {@link Content}s in
 *          the given {@link Resource}.
 */
export function diversify(
  transformer: ContentTransformer,
  filter?: ContentFilter | ((content: Content) => boolean),
): ResourceTransformer {
  function* diverseRepresentations(resource: Resource) {
    for (const repr of resource) {
      yield repr;
      if (
        filter == null ||
        (typeof filter == "function"
          ? filter(repr)
          : repr.matches(filter as ContentFilter))
      ) {
        yield transformer(repr);
      }
    }
  }
  return (resource: Resource): Resource =>
    new Resource(resource.path, diverseRepresentations(resource));
}

/**
 * Gets a content transformer which updates a given {@link Content}'s some
 * fields to the specific values.
 *
 * Designed to work with {@link Pipeline#transform} or
 * {@link Pipeline#diversify} methods.
 * @param fields The field values which will be filled to {@link Content}s'
 *               corresponding fields.  See also {@link Content#replace} method
 *               and {@link ContentFields} interface for how to use.
 * @returns A content transformer which updates a given {@link Content}'s
 *          fields to the specific values.
 * @throws {MediaTypeError} Thrown when the given `fields.type` is not a valid
 *         IANA media type.
 * @throws {LanguageTagError} Thrown when the given `fields.language` is not
 *         a valid RFC 5646 language tag.
 */
export function replace(fields: ContentFields): ContentTransformer {
  if (typeof fields.type == "string") {
    fields = { ...fields, type: MediaType.fromString(fields.type) };
  }
  if (typeof fields.language == "string") {
    fields = { ...fields, language: LanguageTag.fromString(fields.language) };
  }
  return (content: Content): Content => content.replace(fields);
}

export { Content, LanguageTag, MediaType, Resource };
export default Pipeline;
