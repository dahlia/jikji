/**
 * @copyright 2021 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  _format,
  AssertionError,
  equal,
} from "https://deno.land/std@0.115.1/testing/asserts.ts";
import {
  diff,
  DiffResult,
  DiffType,
} from "https://deno.land/std@0.115.1/testing/_diff.ts";
import {
  bold,
  gray,
  green,
  red,
  white,
} from "https://deno.land/std@0.115.1/fmt/colors.ts";
import { Content } from "./content.ts";
import { Resource } from "./resource.ts";

async function setEquals(
  actual?: Set<unknown>,
  expected?: Set<unknown>,
): Promise<boolean> {
  if (actual != null && expected != null) {
    if (actual.size != expected.size) return false;
    for (const value of actual) {
      if (!expected.has(value)) {
        let eq = false;
        for (const v of expected) {
          if (await equals(value, v)) {
            eq = true;
            break;
          }
        }
        return eq;
      }
    }
    return true;
  }

  return actual === expected;
}

async function mapEquals(
  actual?: Map<unknown, unknown>,
  expected?: Map<unknown, unknown>,
): Promise<boolean> {
  if (actual != null && expected != null) {
    if (actual.size != expected.size) return false;
    for (const [key, value] of actual.entries()) {
      if (!await equals(expected.get(key), value)) return false;
    }
    return true;
  }

  return actual === expected;
}

async function contentEquals(
  actual?: Content | null,
  expected?: Content | null,
): Promise<boolean> {
  if (actual != null && expected != null) {
    // Load bodies & metadata ahead of time to make these instances to be
    // completely rendered by Deno.inspect() function:
    let aBody = await actual.getBody();
    let eBody = await expected.getBody();
    let aType = actual.type;
    let eType = expected.type;

    if (
      aBody instanceof Uint8Array &&
      typeof eBody == "string" &&
      expected.encoding == "utf-8"
    ) {
      eBody = new TextEncoder().encode(eBody);
      eType = eType.withParameter("charset", null);
    } else if (
      typeof aBody == "string" &&
      eBody instanceof Uint8Array &&
      actual.encoding == "utf-8"
    ) {
      aBody = new TextEncoder().encode(aBody);
      aType = aType.withParameter("charset", null);
    }

    return aType === eType &&
      actual.language === expected.language &&
      equal(actual.lastModified, expected.lastModified) &&
      equal(aBody, eBody) &&
      equal(await actual.getMetadata(), await expected.getMetadata()) &&
      equal(actual.eTag, expected.eTag);
  }

  return actual === expected;
}

async function contentsEqual(
  actual: unknown[],
  expected: unknown[],
) {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i], e = expected[i];
    if (!(a instanceof Content && e instanceof Content)) return false;
    if (!await contentEquals(a, e)) return false;
  }

  return true;
}

function contentKeyCmp(a: Content, b: Content): number {
  return a.key.toString().localeCompare(b.key.toString());
}

async function resourceEquals(
  actual?: Resource | null,
  expected?: Resource | null,
) {
  if (actual != null && expected != null) {
    if (
      !equal(actual.path, expected.path) ||
      !equal(actual.lastModified, expected.lastModified) ||
      actual.size !== expected.size
    ) {
      return false;
    }

    const actualContents = [...actual].sort(contentKeyCmp);
    const expectedContents = [...expected].sort(contentKeyCmp);
    return await contentsEqual(actualContents, expectedContents);
  }

  return actual === expected;
}

async function resourcesEqual(
  actual: unknown[],
  expected: unknown[],
) {
  if (actual.length !== expected.length) return false;

  for (let i = 0; i < actual.length; i++) {
    const a = actual[i], e = expected[i];
    if (!(a instanceof Resource && e instanceof Resource)) return false;
    if (!await resourceEquals(a, e)) return false;
  }

  return true;
}

async function equals(
  actual: unknown,
  expected: unknown,
): Promise<boolean> {
  if (actual instanceof Set && expected instanceof Set) {
    return await setEquals(actual, expected);
  } else if (actual instanceof Set || expected instanceof Set) {
    return false;
  } else if (actual instanceof Map && expected instanceof Map) {
    return await mapEquals(actual, expected);
  } else if (actual instanceof Map || expected instanceof Map) {
    return false;
  } else if (actual instanceof Content && expected instanceof Content) {
    return await contentEquals(actual, expected);
  } else if (actual instanceof Content || expected instanceof Content) {
    return false;
  } else if (actual instanceof Resource && expected instanceof Resource) {
    return await resourceEquals(actual, expected);
  } else if (actual instanceof Resource || expected instanceof Resource) {
    return false;
  } else if (
    actual instanceof Array && expected instanceof Array &&
    (actual.length > 0 || expected.length > 0)
  ) {
    if (actual.length != expected.length) return false;
    else if (
      actual.some((r) => r instanceof Resource) ||
      expected.some((r) => r instanceof Resource)
    ) {
      return await resourcesEqual(actual, expected);
    } else if (
      actual.some((c) => c instanceof Content) ||
      expected.some((c) => c instanceof Content)
    ) {
      return await contentsEqual(actual, expected);
    }
  }

  return equal(actual, expected);
}

function createColor(diffType: DiffType): (s: string) => string {
  switch (diffType) {
    case DiffType.added:
      return (s: string): string => green(bold(s));
    case DiffType.removed:
      return (s: string): string => red(bold(s));
    default:
      return white;
  }
}

function createSign(diffType: DiffType): string {
  switch (diffType) {
    case DiffType.added:
      return "+   ";
    case DiffType.removed:
      return "-   ";
    default:
      return "    ";
  }
}

function buildMessage(diffResult: ReadonlyArray<DiffResult<string>>): string[] {
  const messages: string[] = [];
  messages.push("");
  messages.push("");
  messages.push(
    `    ${gray(bold("[Diff]"))} ${red(bold("Actual"))} / ${
      green(bold("Expected"))
    }`,
  );
  messages.push("");
  messages.push("");
  diffResult.forEach((result: DiffResult<string>): void => {
    const c = createColor(result.type);
    messages.push(c(`${createSign(result.type)}${result.value}`));
  });
  messages.push("");

  return messages;
}

export function assertEquals$(
  actual: unknown,
  expected: unknown,
  msg?: string,
): Promise<void>;
export function assertEquals$<T>(
  actual: T,
  expected: T,
  msg?: string,
): Promise<void>;
export async function assertEquals$(
  actual: unknown,
  expected: unknown,
  msg?: string,
): Promise<void> {
  if (await equals(actual, expected)) {
    return;
  }
  let message = "";
  const actualString = _format(actual);
  const expectedString = _format(expected);
  try {
    const diffResult = diff(
      actualString.split("\n"),
      expectedString.split("\n"),
    );
    const diffMsg = buildMessage(diffResult).join("\n");
    message = `Values are not equal:\n${diffMsg}`;
  } catch {
    message = `\n${red("[Cannot display]")} + \n\n`;
  }
  if (msg) {
    message = msg;
  }
  throw new AssertionError(message);
}
