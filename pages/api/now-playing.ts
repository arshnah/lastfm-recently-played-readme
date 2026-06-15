/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from 'next';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

interface LastFmImage {
  size?: string;
  '#text'?: string;
}

interface LastFmTrack {
  '@attr'?: { nowplaying?: string };
  name?: string;
  artist?: { '#text'?: string };
  album?: { '#text'?: string };
  image?: LastFmImage[];
}

interface LastFmResponse {
  recenttracks?: {
    track?: LastFmTrack[];
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const { user } = req.query;
  const API_KEY = process.env.API_KEY;

  if (!user || !API_KEY) {
    res.status(400).send('Missing user or API_KEY');
    return;
  }

  try {
    const lfmRes = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${user}&api_key=${API_KEY}&format=json&limit=1`,
    );
    const lfmData = (await lfmRes.json()) as LastFmResponse;
    const track = lfmData.recenttracks?.track?.[0];

    if (!track) {
      res.status(404).send('No tracks found');
      return;
    }

    const isPlaying = track['@attr']?.nowplaying === 'true';
    const trackName = escapeXml(track.name ?? 'Unknown');
    const artistName = escapeXml(track.artist?.['#text'] ?? 'Unknown');
    const albumName = escapeXml(track.album?.['#text'] ?? '');

    const images = track.image ?? [];
    const artUrl =
      images.find((i) => i.size === 'extralarge')?.['#text'] ??
      images.find((i) => i.size === 'large')?.['#text'] ??
      '';

    const DEFAULT_ART = '2a96cbd8b46e442fc41c2b86b821562f';
    let artBase64 = '';

    if (artUrl && !artUrl.includes(DEFAULT_ART)) {
      try {
        const artBuf = await (await fetch(artUrl)).arrayBuffer();
        artBase64 = `data:image/jpeg;base64,${Buffer.from(artBuf).toString('base64')}`;
      } catch (_) {
        artBase64 = '';
      }
    }

    const W = 480;
    const H = 110;
    const ART = 72;
    const X = 20;
    const TX = X + ART + 16;

    // pre-compute to avoid long lines in template
    const tTrack = truncate(trackName, 30);
    const tArtist = truncate(artistName, 34);
    const tAlbum = truncate(albumName, 38);
    const lastFmY = H - 8;
    const artMidX = X + ART / 2;
    const artMidY = 19 + ART / 2 + 9;
    const dotX = TX + 12;

    const artTag = artBase64
      ? `<image href="${artBase64}" x="${X}" y="19" width="${ART}" height="${ART}" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${X}" y="19" width="${ART}" height="${ART}" rx="6" fill="#1f1f1f"/><text x="${artMidX}" y="${artMidY}" text-anchor="middle" fill="#555" font-size="26">&#9835;</text>`;

    const statusTag = isPlaying
      ? `<circle cx="${TX}" cy="28" r="5" fill="#D51007"><animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite"/></circle><text x="${dotX}" y="32" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#D51007" font-weight="700">NOW PLAYING</text>`
      : `<text x="${TX}" y="32" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#555" font-weight="700">LAST PLAYED</text>`;

    const svg = [
      `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
      `<defs><clipPath id="c"><rect x="${X}" y="19" width="${ART}" height="${ART}" rx="6"/></clipPath></defs>`,
      `<rect width="${W}" height="${H}" rx="14" fill="#0d1117"/>`,
      `<rect x="0" y="0" width="4" height="${H}" rx="2" fill="#D51007"/>`,
      artTag,
      statusTag,
      `<text x="${TX}" y="56" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="700" fill="#fff">${tTrack}</text>`,
      `<text x="${TX}" y="75" font-family="Segoe UI,Arial,sans-serif" font-size="12" fill="#aaa">${tArtist}</text>`,
      `<text x="${TX}" y="91" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#666">${tAlbum}</text>`,
      `<text x="${W - 14}" y="${lastFmY}" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="#333" text-anchor="end">last.fm</text>`,
      `</svg>`,
    ].join('');

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.send(svg);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
}