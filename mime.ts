/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import { Mime } from "mime";
import otherTypes from "mime/types/other.js";
import standardTypes from "mime/types/standard.js";

type MimeTypeMap = Record<string, string[]>;

/**
 * Extends a given `mime` object with given `typeMaps`.
 * @param mime A base {@link Mime} instance to extend.
 * @param typeMaps Additional type maps.
 * @returns A distinct {@link Mime} instance with extended types.
 */
export function extendMime(mime: Mime, ...typeMaps: MimeTypeMap[]): Mime {
  const mimeTypes: MimeTypeMap = {};
  const types = mime._getTestState().extensions.keys();
  for (const type of types) {
    const extensions = mime.getAllExtensions(type) ?? [];
    for (const ext of extensions) {
      if (type in mimeTypes) mimeTypes[type].push(ext);
      else mimeTypes[type] = [ext];
    }
  }

  return new Mime(mimeTypes, ...typeMaps);
}

/**
 * Default {@link Mime} instance.
 */
const defaultMime: Mime = new Mime(standardTypes, otherTypes);

export { defaultMime, Mime };
