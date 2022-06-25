/**
 * @copyright 2022 Hong Minhee
 * @license LGPL-3.0-only
 */
import {
  Mime,
  mime,
  MimeTypeMap,
} from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";

/**
 * Extends a given `mime` object with given `typeMaps`.
 * @param mime A base {@link Mime} instance to extend.
 * @param typeMaps Additional type maps.
 * @returns A distinct {@link Mime} instance with extended types.
 */
export function extendMime(mime: Mime, ...typeMaps: MimeTypeMap[]): Mime {
  const mimeTypes: MimeTypeMap = {};
  mime.types.forEach((type, ext) => {
    if (type in mimeTypes) mimeTypes[type].push(ext);
    else mimeTypes[type] = [ext];
  });

  return new Mime(mimeTypes, ...typeMaps);
}

/**
 * Default {@link Mime} instance.
 */
const defaultMime = extendMime(mime);

export { defaultMime, Mime };
