# Music Search and Selection Design

## Goal

Change the music command flow so a typed song query returns five accurate song candidates before downloading. WhatsApp users select a candidate by replying with `1`–`5`; Telegram users select with inline buttons. A direct Spotify track link remains an immediate download request.

## Interaction design

### WhatsApp

For `.play <query>`, `.lagu <query>`, `.music <query>`, or `.song <query>`:

1. Search five candidates and send one compact message.
2. Each row contains the number, song title, and artist/channel.
3. Do not send a progress or loading message while searching.
4. Store the five candidates for that chat and requesting sender for a short TTL.
5. When that sender replies with `1`–`5`, download the matching candidate and send the audio.

An invalid number gets a short correction message. An expired selection asks the user to search again. A direct Spotify track URL bypasses the candidate list and downloads immediately.

### Telegram

For `/play <query>` and its aliases, send the same five candidates as a formatted music-search card. Add one inline button for each result and a cancel button. Selecting a button acknowledges the callback, downloads the selected candidate, and sends the audio. The selection is bound to the requesting Telegram user and chat.

## Search and download data flow

The downloader exposes a search operation returning normalized candidates:

```text
{ id, url, title, artist, duration }
```

The search uses yt-dlp metadata search for five results and does not download media. Candidate display uses the returned title and channel/uploader, with HTML/WhatsApp-safe escaping. Download receives the selected candidate URL so the selected result is the file that gets sent.

Direct Spotify URLs continue through Spotify oEmbed to resolve the track title, then download immediately using the existing fallback strategy.

## State and errors

Selection state is kept in memory with a short expiry (10 minutes), keyed by platform, chat, and requester. A new query replaces the previous selection for that requester. Telegram callback payloads use an opaque short token plus result index so callback data stays within Telegram limits. Failed searches and downloads produce one concise error reply; temporary state is cleared after a successful selection or expiry.

## Telegram presentation

The search card uses a bold heading, a short instruction, five consistently formatted result rows, and a two-column button grid. The download action may edit the card caption/text to a compact status before sending the audio, while preserving the existing menu visual style and fallback behavior.

## Verification

- Unit-level checks for result normalization, escaping, state expiry, requester binding, and selection index handling.
- Existing smoke tests must continue to pass.
- Manual behavior checks cover WhatsApp query → number → audio, Telegram query → button → audio, direct Spotify URL, invalid/expired selections, and failed searches.
