import {
  _format,
  AssertionError,
  equal,
} from "https://deno.land/std@0.99.0/testing/asserts.ts";
import {
  diff,
  DiffResult,
  DiffType,
} from "https://deno.land/std@0.99.0/testing/_diff.ts";
import {
  bold,
  gray,
  green,
  red,
  white,
} from "https://deno.land/std@0.99.0/fmt/colors.ts";
import { Content } from "./content.ts";
import { Resource } from "./resource.ts";

async function contentEquals(
  actual?: Content | null,
  expected?: Content | null,
): Promise<boolean> {
  if (actual != null && expected != null) {
    // Load bodies & metadata ahead of time to make these instances to be
    // completely rendered by Deno.inspect() function:
    await actual.getMetadata();
    await expected.getMetadata();

    return actual.key === expected.key &&
      equal(actual.lastModified, expected.lastModified) &&
      equal(await actual.getBody(), await expected.getBody()) &&
      equal(await actual.getMetadata(), await expected.getMetadata());
  }

  return actual === expected;
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

    const actualContents = [...actual];
    const expectedContents = [...expected];
    for (let i = 0; i < actual.size; i++) {
      if (!await contentEquals(actualContents[i], expectedContents[i])) {
        return false;
      }
    }

    return true;
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
  if (actual instanceof Content && expected instanceof Content) {
    return await contentEquals(actual, expected);
  } else if (actual instanceof Content || expected instanceof Content) {
    return false;
  } else if (actual instanceof Resource && expected instanceof Resource) {
    return await resourceEquals(actual, expected);
  } else if (actual instanceof Resource || expected instanceof Resource) {
    return false;
  } else if (
    actual instanceof Array && expected instanceof Array &&
    (actual.length < 1 ||
      actual.some((r) => r instanceof Resource) ||
      expected.length < 1 ||
      expected.some((r) => r instanceof Resource))
  ) {
    if (actual.length != expected.length) return false;
    return await resourcesEqual(actual, expected);
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
