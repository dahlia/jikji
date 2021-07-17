import concat from "https://esm.sh/@async-generators/concat@0.1.0";
import map from "https://esm.sh/@async-generators/map@0.1.0";
import filter from "https://esm.sh/@async-generators/filter@0.1.1";
import { MediaType } from "./media_type.ts";
import { LanguageTag } from "./language_tag.ts";
import {
  Content,
  ContentCriterion,
  ContentFields,
  toContentPredicate,
} from "./content.ts";
import { Resource } from "./resource.ts";

/** Represents a type `T` except for `undefined`. */
export type NonUndefined<T> = T extends undefined ? never : T;

/**
 * Represents functions to summarize {@link Resource}s in a `pipeline` into
 * {@link Resource}s.
 * @param pipeline A pipeline with {@link Resource}s to summarize.
 * @returns Summary as {@link Resource}s.
 */
export type PipelineSummarizer = (pipeline: Pipeline) => (
  | AsyncIterable<Resource>
  | Promise<Resource>
  | Iterable<Resource>
  | Resource
);

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
 *
 * Note that it as a data structure works as like sets rather than lists.
 * There cannot be more {@link Resource}s than one with the duplicate `path`s.
 */
export class Pipeline implements AsyncIterable<Resource> {
  readonly #getResources: () => AsyncIterable<Resource>;
  #buffer?: Resource[];
  #resourcesMonitor?: AsyncIterable<void>;

  /**
   * Creates a new pipeline with the given asynchronous iterable of
   * {@link Resource}s.
   * @param resources An iterable or asynchronous iterable of {@link Resource}s.
   *                  As {@link Pipeline} objects in themselves are also
   *                  asynchronous iterable, these can be passed here.
   *                  If there are more {@link Resource}s than one with
   *                  the duplicate `path`s, later one is ignored.
   */
  constructor(resources: AsyncIterable<Resource> | Iterable<Resource>);

  /**
   * Creates a new pipeline with the function to get {@link Resource}s and
   * a monitor to signal when resources are updated.
   * @param resourcesGetter A function to load {@link Resource}s.
   *                        If there are more {@link Resource}s than one with
   *                        the duplicate `path`s, later one is ignored.
   * @param resourcesMonitor A monitor to signal when resources are updated.
   *                         When this asynchronous iterable yields,
   *                         resources in the pipeline are reloaded using
   *                         `resourcesGetter` function.
   */
  constructor(
    resourcesGetter: () => AsyncIterable<Resource>,
    resourcesMonitor: AsyncIterable<void> | null,
  );

  constructor(
    resourcesGetter:
      | (() => AsyncIterable<Resource>)
      | AsyncIterable<Resource>
      | Iterable<Resource>,
    resourcesMonitor?: AsyncIterable<void> | null,
  ) {
    this.#getResources = typeof resourcesGetter == "function"
      ? resourcesGetter
      : () =>
        Symbol.asyncIterator in resourcesGetter
          ? resourcesGetter as AsyncIterable<Resource>
          : toAsyncIterable(resourcesGetter as Iterable<Resource>);
    if (resourcesGetter instanceof Array) {
      this.#buffer = resourcesGetter;
    }
    if (resourcesMonitor != null) {
      this.#resourcesMonitor = map(resourcesMonitor, (_) => {
        this.#buffer = undefined;
      });
    }
  }

  /**
   * Gets the last time any resource/content was modified.
   * @returns The last time any resource/content in the pipeline was modified.
   *          It can be `null` if there are no resources at all.
   */
  async getLastModified(): Promise<Date | null> {
    let result: Date | null = null;
    for await (const r of this) {
      const modified = r.lastModified;
      if (result == null || modified > result) {
        result = modified;
      }
    }
    return result;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Resource> {
    if (this.#buffer == null) {
      const buffer: Resource[] = [];
      const paths = new Set<string>();
      for await (const resource of this.#getResources()) {
        const path = resource.path.toString();
        if (paths.has(path)) continue;
        paths.add(path);
        buffer.push(resource);
        yield resource;
      }
      this.#buffer = buffer;
    } else {
      yield* this.#buffer;
    }
  }

  /**
   * Merges all {@link Resource}s in two pipelines into a distinct pipeline.
   * @param pipeline A pipeline to merge with.  Resources having overlapped
   *                 paths in it are ignored in the merged pipeline.
   * @returns A distinct pipeline having all {@link Resource}s in two pipelines.
   */
  union(pipeline: Pipeline): Pipeline {
    return new Pipeline(
      () => concat(this, pipeline),
      this.#resourcesMonitor ?? null,
    );
  }

  /**
   * Adds a `resource` to the pipeline.
   * @param resource A resource to add.  If its `path` is duplicate with
   *                 existing resource paths, existing one is replaced by it.
   * @returns A distinct pipeline having the added `resource` besides existing
   *          ones.
   */
  add(resource: Resource): Pipeline {
    return new Pipeline(
      () => concat([resource], this),
      this.#resourcesMonitor ?? null,
    );
  }

  /**
   * Summarize {@link Resource}s in the pipeline into new {@link Resource}s,
   * and adds them into a distinct pipeline besides existing {@link Resource}s.
   *
   * If a summary's `path` is duplicate with any `path` of existing
   * resources, the existing resource is replaced by the summary.
   * @param summarizer A function to summarize {@link Resource}s in the pipeline
   *                   into new {@link Resource}s.
   * @param predicate An optional predicate to filter {@link Resource}s in
   *                  the pipeline to summarize.  Only {@link Resource}s
   *                  satisfying the predicate are summarized.
   *                  Include all {@link Resource}s by default.
   * @returns A distinct pipeline having new summary {@link Resource}s
   *          besides existing {@link Resource}s.
   */
  addSummaries(
    summarizer: PipelineSummarizer,
    predicate?: ResourcePredicate,
  ): Pipeline {
    const summary = summarizer(
      predicate == null ? this : this.filter(predicate),
    );

    if (summary instanceof Promise) {
      const iter = async function* (): AsyncIterable<Resource> {
        yield await summary;
      };
      return new Pipeline(concat(iter(), this));
    } else if (summary instanceof Resource) {
      return this.add(summary);
    }

    return new Pipeline(
      () => concat(summary, this),
      this.#resourcesMonitor ?? null,
    );
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
    return new Pipeline(
      () => {
        let resources: AsyncIterable<Resource> = this[Symbol.asyncIterator]();
        for (const transformer of transformers) {
          resources = map(resources, transformer);
        }
        return resources;
      },
      this.#resourcesMonitor ?? null,
    );
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
    return new Pipeline(
      () => {
        let resources: AsyncIterable<Resource> = this[Symbol.asyncIterator]();
        for (const pred of predicates) {
          resources = filter(resources, pred);
        }
        return resources;
      },
      this.#resourcesMonitor ?? null,
    );
  }

  /**
   * Organizes resources in the pipeline into a map of groups, where keys are
   * common values among resources in each group and values are resources
   * having their common group values.  Key is determined by a function passed
   * through the parameter `grouper`.
   *
   * Note that keys cannot be `undefined`.
   * @param grouper A function to extract the commons values from resources
   *                to determine groups they belong to.  To exclude a resource
   *                from any groups return `undefined`.
   * @returns A map of groups, where keys are common values among resources
   *          in each group and values are resources having their common group
   *          values (which are determined by `grouper`).
   */
  async groupBy<T>(
    grouper: (resource: Resource) => T | undefined,
  ): Promise<Map<NonUndefined<T>, ResourceSet>> {
    const groups = new Map<NonUndefined<T>, ResourceSet>();
    await this.forEach((resource: Resource) => {
      const groupKey: T | undefined = grouper(resource);
      if (groupKey !== undefined) {
        const key = groupKey as NonUndefined<T>;
        const group = groups.get(key);
        if (group === undefined) groups.set(key, new ResourceSet([resource]));
        else group.add(resource);
      }
    });
    return groups;
  }

  /**
   * Executes a provided `callback` function once for each {@link Resource}.
   * Unlike {@link map} method, this returns a promise resolving nothing.
   * Note that this guarantees nothing about its execution order.
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
   * @param criterion An optional criterion to transform {@link Content}s.
   *                  {@link Content}s that do not satisfy the criterion will
   *                  not be transformed, but will be as these are.
   * @returns A distinct pipeline with transformed {@link Content}s.
   */
  transform(
    transformer: ContentTransformer,
    criterion?: ContentCriterion,
  ): Pipeline {
    return this.map(transform(transformer, criterion));
  }

  /**
   * Similar to {@link Pipeline#transform}, except that it does not replace
   * existing {@link Content}s in {@link Resource}s, but adds transformed
   * {@link Content}s with maintaining existing {@link Content}s instead.
   * @param transformer A content transformer to apply to {@link Content}s in
   *                    {@link Resource}s.
   * @param criterion An optional filter to transform {@link Content}s.
   *                  {@link Content}s that do not satisfy the filter will not
   *                  be transformed.
   * @returns A distinct pipeline with transformed {@link Content}s.
   */
  diversify(
    transformer: ContentTransformer,
    criterion?: ContentCriterion,
  ): Pipeline {
    return this.map(diversify(transformer, criterion));
  }

  /**
   * Similar to {@link Pipeline#forEach}, except that this monitors if resources
   * are updated, and reloads them if they are.
   * Unlike {@link Pipeline#forEach}, this usually does not terminate unless
   * the monitor is terminated or the pipeline has no monitor.
   * Its most common usage is to watch files in a directory for changes,
   * and rebuild the pipeline when changes are detected.
   * @param callback A callback function to be invoked with each
   *                 {@link Resource}, and its index.
   * @param onReloaded A callback function to be invoked when resource update
   *                   is detected and it is to be reloaded.
   */
  async forEachWithReloading(
    callback:
      | ((resource: Resource, index: number) => Promise<void>)
      | ((resource: Resource, index: number) => void)
      | ((resource: Resource) => Promise<void>)
      | ((resource: Resource) => void),
    onReloaded?: ((() => Promise<void>) | (() => void)),
  ): Promise<void> {
    await this.forEach(callback);
    if (this.#resourcesMonitor != null) {
      for await (const _ of this.#resourcesMonitor) {
        if (onReloaded != null) {
          const p = onReloaded();
          if (p instanceof Promise) await p;
        }
        await this.forEach(callback);
      }
    }
  }
}

/**
 * {@link Set} of {@link Resource}s, with an additional property
 * {@link #lastModified}.
 */
export class ResourceSet extends Set<Resource> {
  /**
   * The last modified time of the {@link Resource}s in this set.
   */
  get lastModified(): Date {
    let maxTime = 0;
    for (const resource of this) {
      const time = resource.lastModified.getTime();
      if (time > maxTime) maxTime = time;
    }
    return new Date(maxTime);
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
 * @param criterion An optional criterion to transform {@link Content}s.
 *                  {@link Content}s that do not satisfy the criterion will not
 *                  be transformed, but will be as these are.
 * @returns A resource transformer turned from the given content transformer.
 */
export function transform(
  transformer: ContentTransformer,
  criterion?: ContentCriterion,
): ResourceTransformer {
  const satisfies = toContentPredicate(criterion);
  function* transformRepresentations(resource: Resource) {
    for (const repr of resource) {
      yield satisfies(repr) ? transformer(repr) : repr;
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
 * @param criterion An optional criterion to transform {@link Content}s.
 *                  {@link Content}s that do not satisfy the criterion will not
 *                  be transformed.
 * @returns A resource transformer which diversifies {@link Content}s in
 *          the given {@link Resource}.
 */
export function diversify(
  transformer: ContentTransformer,
  criterion?: ContentCriterion,
): ResourceTransformer {
  const satisfies = toContentPredicate(criterion);
  function* diverseRepresentations(resource: Resource) {
    for (const repr of resource) {
      yield repr;
      if (satisfies(repr)) {
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
