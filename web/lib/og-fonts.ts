import { cacheLife } from "next/cache";

/**
 * Instrument Serif as TTF for share cards (ImageResponse can't read woff2).
 * Google Fonts serves TTF when the request has no browser user agent.
 */
export async function loadSerif(): Promise<ArrayBuffer | null> {
  "use cache";
  cacheLife("max");
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Instrument+Serif")).text();
    const url = /src: url\((.+?)\) format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}
