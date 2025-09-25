## Ouedkniss → Discord Bot (Algiers Rentals)

A lightweight bot that automatically fetches the latest apartment rental listings from Ouedkniss and posts them to a Discord channel. Built for users in Algeria (Algiers) with useful filters and clean links to listings.

### Key features

- Periodically posts new listings to a Discord channel (embed + image).
- Built-in filtering: only listings with photos and a price.
- Default scope: Algiers (wilaya 16) and popular communes (Dely Ibrahim, Cheraga, Hydra, Kouba, Ben Aknoun, etc.).
- Proper Ouedkniss links (e.g. `https://www.ouedkniss.com/appartement-location-f4-alger-cheraga-algerie-d12345678`).
- No duplicates: each listing is posted once (persisted in `postedIds.json`).
- Clear console logs: number fetched / sent / skipped.

### How it works

- The bot polls the Ouedkniss GraphQL API every 10 minutes (not a websocket).
- Listings are filtered server-side and client-side:
  - Category: `immobilier-location-appartement`
  - Wilaya: `16` (Algiers)
  - Communes: `Ben Aknoun, Chevalley, Cheraga, Dely Brahim, El-Achour, El-Biar, Hydra`
  - Price range: `[1, 8]` (in millions) and `hasPrice: true`
  - With photos: `hasPictures: true`
  - Order: most recently refreshed first

### Requirements

- Node.js 18+
- Discord server/account and a bot token
- Bot permission to send messages in the target channel

### Setup

```bash
git clone <this-repo>
cd ouedkniss-discord-bot
npm install
```

Create a `.env` file in the project root:

```env
DISCORD_BOT_TOKEN=your_discord_token
TARGET_CHANNEL_ID=123456789012345678
```

### Run the bot

```bash
node index.js
```

You should see in the console:

- “Discord bot ready!” on startup
- For each sent listing: `Sent offer to Discord: id=..., title="...", url=...`
- A summary every cycle: `Poll @ ... -> fetched=20, sent=2, skipped=18`

### Tuning filters (optional)

Open `index.js` and edit `variables.filter` in the GraphQL payload:

- `regionIds`: change wilaya
- `cityIds`: add/remove communes
- `priceRange`: adjust budget (in millions)
- `count`: how many listings per cycle
- `hasPictures` / `hasPrice`: enable/disable

### Deploy (PM2 recommended)

```bash
npm i -g pm2
pm2 start index.js --name ouedkniss-bot
pm2 logs ouedkniss-bot
pm2 save
```

### Tips & notes

- Make sure `TARGET_CHANNEL_ID` points to the correct Discord channel.
- `postedIds.json` stores posted listing IDs to avoid duplicates. Delete it to repost history.
- Respect Ouedkniss terms of use. Keep reasonable intervals (10 min by default).

### Troubleshooting

- No messages: check bot permissions and the channel ID.
- Broken links: the bot normalizes slugs; if a listing lacks a slug, it builds a `d{id}` link.
- Too many/few listings: tweak `cityIds`, `priceRange` or `count`.

### License

Provided as-is for personal use. Not affiliated with Ouedkniss.
