// pages/api/now-playing.js
// Add this file to your lastfm-recently-played-readme repo

export default async function handler(req, res) {
  const { user } = req.query;
  const API_KEY = process.env.API_KEY;

  if (!user || !API_KEY) {
    return res.status(400).send('Missing user or API_KEY');
  }

  try {
    // Fetch last played track
    const lfmRes = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${user}&api_key=${API_KEY}&format=json&limit=1`
    );
    const lfmData = await lfmRes.json();
    const track = lfmData.recenttracks?.track?.[0];

    if (!track) {
      return res.status(404).send('No tracks found');
    }

    const isPlaying = track['@attr']?.nowplaying === 'true';
    const trackName  = escapeXml(track.name || 'Unknown');
    const artistName = escapeXml(track.artist?.['#text'] || 'Unknown');
    const albumName  = escapeXml(track.album?.['#text'] || '');

    // Get album art — try "extralarge" first, then "large"
    const images = track.image || [];
    const artUrl =
      images.find(i => i.size === 'extralarge')?.[`#text`] ||
      images.find(i => i.size === 'large')?.[`#text`] || '';

    const DEFAULT_ART = '2a96cbd8b46e442fc41c2b86b821562f'; // last.fm placeholder hash
    let artBase64 = '';

    if (artUrl && !artUrl.includes(DEFAULT_ART)) {
      try {
        const artRes = await fetch(artUrl);
        const artBuf = await artRes.arrayBuffer();
        artBase64 = `data:image/jpeg;base64,${Buffer.from(artBuf).toString('base64')}`;
      } catch (_) {}
    }

    const truncate = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;

    const W   = 480;
    const H   = 110;
    const ART = 72;
    const X   = 20;
    const TX  = X + ART + 16;

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <clipPath id="c"><rect x="${X}" y="19" width="${ART}" height="${ART}" rx="6"/></clipPath>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="14"/></clipPath>
  </defs>

  <!-- BG -->
  <rect width="${W}" height="${H}" rx="14" fill="#0d1117"/>
  <!-- Red left bar -->
  <rect x="0" y="0" width="4" height="${H}" rx="2" fill="#D51007"/>

  <!-- Album art or placeholder -->
  ${artBase64
    ? `<image href="${artBase64}" x="${X}" y="19" width="${ART}" height="${ART}" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${X}" y="19" width="${ART}" height="${ART}" rx="6" fill="#1f1f1f"/>
       <text x="${X + ART / 2}" y="${19 + ART / 2 + 9}" text-anchor="middle" fill="#555" font-size="26">♪</text>`
  }

  <!-- Status label -->
  ${isPlaying
    ? `<circle cx="${TX}" cy="28" r="5" fill="#D51007">
         <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite"/>
       </circle>
       <text x="${TX + 12}" y="32" font-family="'Segoe UI',Arial,sans-serif" font-size="10" fill="#D51007" font-weight="700">NOW PLAYING</text>`
    : `<text x="${TX}" y="32" font-family="'Segoe UI',Arial,sans-serif" font-size="10" fill="#555" font-weight="700">LAST PLAYED</text>`
  }

  <!-- Track name -->
  <text x="${TX}" y="56" font-family="'Segoe UI',Arial,sans-serif" font-size="15" font-weight="700" fill="#ffffff">${truncate(trackName, 30)}</text>
  <!-- Artist -->
  <text x="${TX}" y="75" font-family="'Segoe UI',Arial,sans-serif" font-size="12" fill="#aaaaaa">${truncate(artistName, 34)}</text>
  <!-- Album -->
  <text x="${TX}" y="91" font-family="'Segoe UI',Arial,sans-serif" font-size="11" fill="#666">${truncate(albumName, 38)}</text>

  <!-- last.fm watermark -->
  <text x="${W - 14}" y="${H - 8}" font-family="'Segoe UI',Arial,sans-serif" font-size="10" fill="#333" text-anchor="end">last.fm</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.send(svg);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
