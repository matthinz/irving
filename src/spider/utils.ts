import { URL } from "url";

export function isContentTypeAllowed(
  contentType: string,
  allowedContentTypes: string[]
): boolean {
  const normalized = contentType.replace(/;.*/, "").trim().toLowerCase();
  return allowedContentTypes.some((c) => c.toLowerCase() === normalized);
}
