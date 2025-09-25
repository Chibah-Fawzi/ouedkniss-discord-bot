const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const logger = require("./logger");

const FAVORITES_FILE = path.join(__dirname, "favorites.json");

function ensureFavoritesFile() {
  if (!fs.existsSync(FAVORITES_FILE)) {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify([]), "utf-8");
  }
}

function readFavorites() {
  ensureFavoritesFile();
  const raw = fs.readFileSync(FAVORITES_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    logger.warn("favorites_parse_failed", {});
    return [];
  }
}

function writeFavorites(favorites) {
  fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2), "utf-8");
}

function buildFavoriteEmbed({
  title,
  url,
  pricePreview,
  priceUnit,
  priceType,
  mediaUrl,
  city,
  region,
  note,
  userTag,
  createdAt,
}) {
  const embed = new EmbedBuilder()
    .setTitle(title || "Favorite listing")
    .setURL(url)
    .setDescription(
      note ? `Reviewer: ${userTag || "Unknown"}\n\n${note}` : null
    )
    .addFields(
      {
        name: "Price",
        value: `${pricePreview || "N/A"} ${priceUnit || ""} (${
          priceType || ""
        })`,
        inline: true,
      },
      {
        name: "Location",
        value: `${city || "Unknown"}${region ? ", " + region : ""}`,
        inline: true,
      }
    )
    .setImage(mediaUrl || null)
    .setTimestamp(createdAt ? new Date(createdAt) : new Date());
  return embed;
}

module.exports = {
  readFavorites,
  writeFavorites,
  buildFavoriteEmbed,
};
