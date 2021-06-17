import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import { Content } from "./content.ts";

export async function assertContentEquals(
  actual?: Content | null,
  expected?: Content | null,
): Promise<void> {
  if (actual != null && expected != null) {
    assertStrictEquals(actual.key, expected.key);
    assertEquals(actual.lastModified, expected.lastModified);
    assertEquals(await actual.getBody(), await expected.getBody());
  } else {
    assertStrictEquals(actual, expected);
  }
}
