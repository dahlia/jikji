/**
 * @copyright 2021–2023 Hong Minhee
 * @license LGPL-3.0-only
 */
import { ContentCriterion, toContentPredicate } from "./content.ts";
import { Resource } from "./resource.ts";

/**
 * Queries metadata values belonging to {@link Content}s in the given `resource`
 * by their `key`.
 * @param resource A resource to query its contents' metadata.
 * @param key A metadata key to query.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @returns An asynchronous iterable of metadata values from multiple
 *          {@link Content}s.
 */
export async function* queryAll(
  resource: Resource,
  key: string,
  criterion?: ContentCriterion,
): AsyncIterable<unknown> {
  const satisfies = toContentPredicate(criterion);
  for (const content of resource) {
    if (!satisfies(content)) continue;
    const metadata = await content.getMetadata();
    if (metadata == null || !(key in metadata)) continue;
    yield metadata[key];
  }
}

/**
 * Queries a metadata value in string of the given `resource` by its `key`.
 * @param resource A resource to query its content's metadata.
 * @param key A metadata key to query.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @param ignoreEmpty Ignore empty string values.
 * @returns A string value of metadata which is found first.
 *          If there is appropriate metadata it returns `null`.
 */
export async function queryString(
  resource: Resource,
  key: string,
  criterion?: ContentCriterion,
  ignoreEmpty = false,
): Promise<string | null> {
  for await (const candidate of queryAll(resource, key, criterion)) {
    if (typeof candidate != "string") continue;
    if (ignoreEmpty && candidate.trim() === "") continue;
    return candidate;
  }
  return null;
}

/**
 * Queries a latest metadata value in {@link Date} of the given `resource`
 * by its `key`.
 * @param resource A resource to query its content's metadata.
 * @param key A metadata key to query.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @returns A {@link Date} value of metadata which is the latest time.
 *          If there is appropriate metadata it returns `null`.
 */
export async function queryLatestDate(
  resource: Resource,
  key: string,
  criterion?: ContentCriterion,
): Promise<Date | null> {
  let latest: Date | null = null;
  for await (const date of queryAll(resource, key, criterion)) {
    if (!(date instanceof Date)) continue;
    if (latest == null || latest < date) {
      latest = date;
    }
  }
  return latest;
}

/**
 * Queries a earliest metadata value in {@link Date} of the given `resource`
 * by its `key`.
 * @param resource A resource to query its content's metadata.
 * @param key A metadata key to query.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @returns A {@link Date} value of metadata which is the earliest time.
 *          If there is appropriate metadata it returns `null`.
 */
export async function queryEarliestDate(
  resource: Resource,
  key: string,
  criterion?: ContentCriterion,
): Promise<Date | null> {
  let earliest: Date | null = null;
  for await (const date of queryAll(resource, key, criterion)) {
    if (!(date instanceof Date)) continue;
    if (earliest == null || earliest > date) {
      earliest = date;
    }
  }
  return earliest;
}

/**
 * Queries the published time of the given `resource`.
 * @param resource A resource to query its published time.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @returns The published time of the given `resource`.  If there is appropriate
 *          metadata it returns `null`.
 */
export function queryPublished(
  resource: Resource,
  criterion?: ContentCriterion,
): Promise<Date | null> {
  return queryEarliestDate(resource, "published", criterion);
}

/**
 * Queries the title of the given `resource`.
 * @param resource A resource to query its title.
 * @param criterion An optional criterion to filter {@link Content}s.
 *                  Excluded {@link Content}s' metadata are ignored.
 * @returns The title of the given `resource`.  If there is appropriate
 *          metadata it returns `null`.
 */
export function queryTitle(
  resource: Resource,
  criterion?: ContentCriterion,
): Promise<string | null> {
  return queryString(resource, "title", criterion, true);
}

/**
 * Sorts the given `resources` by the specified `key` function.
 * @param resources An asynchronous/synchronous iterable of resources to sort.
 * @param key A function to extract the key to sort by.
 * @param reverse Whether to sort in descending order.  Sorts in ascending order
 *                by default.
 * @returns An array of sorted {@link Resource}s.
 */
export async function sortResources(
  resources: AsyncIterable<Resource> | Iterable<Resource>,
  key:
    | ((resource: Resource) => number | null | undefined)
    | ((resource: Resource) => string | null | undefined)
    | ((resource: Resource) => Date | null | undefined)
    | ((resource: Resource) => Promise<number | null | undefined>)
    | ((resource: Resource) => Promise<string | null | undefined>)
    | ((resource: Resource) => Promise<Date | null | undefined>),
  reverse = false,
): Promise<Resource[]> {
  const promises: Promise<
    [Resource, number | string | Date | null | undefined]
  >[] = [];
  for await (const r of resources) {
    const p = key(r);
    promises.push(
      p instanceof Promise ? p.then((k) => [r, k]) : Promise.resolve([r, p]),
    );
  }
  const array: [Resource, number | string | Date | null | undefined][] =
    await Promise.all(promises);

  const one = reverse ? -1 : 1;
  array.sort(([, aKey], [, bKey]) => {
    const aType = typeof aKey;
    const bType = typeof bKey;
    if (aType == "undefined") {
      return bType == "undefined" ? 0 : bKey === null ? one : -one;
    } else if (aKey === null) {
      return bType == "undefined" ? -one : bKey === null ? 0 : one;
    } else if (aType == "number") {
      return bKey == null ? -one : one * ((aKey as number) - (bKey as number));
    } else if (aType == "string") {
      return bKey == null
        ? -one
        : (aKey as string).localeCompare(bKey as string);
    } else {
      return bKey == null
        ? -one
        : one * ((aKey as Date).getTime() - (bKey as Date).getTime());
    }
  });
  return array.map(([r]) => r);
}
