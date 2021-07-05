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
