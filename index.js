const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  Collection,
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const POSTED_IDS_FILE = path.join(__dirname, "postedIds.json");
const FAVORITES_CHANNEL_ID = process.env.FAVORITES_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

let postedIds = new Set();
const commands = new Collection();
const recentById = new Map();

// Load posted IDs from file if exists
function loadPostedIds() {
  if (fs.existsSync(POSTED_IDS_FILE)) {
    const data = fs.readFileSync(POSTED_IDS_FILE, "utf-8");
    try {
      const ids = JSON.parse(data);
      postedIds = new Set(ids);
    } catch (err) {
      console.error("Failed to parse postedIds.json, starting with empty set");
      postedIds = new Set();
    }
  }
}

// Save posted IDs to file
function savePostedIds() {
  fs.writeFileSync(POSTED_IDS_FILE, JSON.stringify([...postedIds]), "utf-8");
}

// Fetch listing data from Ouedkniss GraphQL API
async function fetchOuedknissListings() {
  const url = "https://api.ouedkniss.com/graphql";
  const headers = {
    accept: "*/*",
    "accept-language": "fr",
    authorization: "",
    "content-type": "application/json",
    locale: "fr",
    origin: "https://www.ouedkniss.com",
    priority: "u=1, i",
    referer: "https://www.ouedkniss.com/",
    "sec-ch-ua": '"Opera";v="120", "Not-A.Brand";v="8", "Chromium";v="135"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/120.0.0.0",
    "x-app-version": '"3.3.42"',
    "x-referer": "https://www.ouedkniss.com/immobilier-location-appartement/1",
    "x-track-id": "ca6e4945-80c1-4b29-a8c4-9fce56dd04aa",
    "x-track-timestamp": "1758801643",
  };

  const data = {
    operationName: "SearchQuery",
    variables: {
      mediaSize: "MEDIUM",
      q: null,
      filter: {
        categorySlug: "immobilier-location-appartement",
        origin: null,
        connected: false,
        delivery: null,
        regionIds: ["16"],
        cityIds: [
          "566",
          "577",
          "578",
          "580",
          "583",
          "584",
          "594",
          "595",
          "608",
        ],
        priceRange: [1, 8],
        exchange: null,
        hasPictures: true,
        hasPrice: true,
        priceUnit: "MILLION",
        fields: [],
        page: 1,
        orderByField: { field: "REFRESHED_AT" },
        count: 20, // fetch 10 listings each time
      },
    },
    query: `query SearchQuery($q: String, $filter: SearchFilterInput, $mediaSize: MediaSize) {
      search(q: $q, filter: $filter) {
        announcements {
          data {
            id
            title
            slug
            createdAt: refreshedAt
            description
            pricePreview
            priceUnit
            priceType
            cities {
              name
              region {
                name
              }
            }
            defaultMedia(size: $mediaSize) {
              mediaUrl
            }
            store {
              name
            }
          }
        }
      }
    }`,
  };

  const response = await axios.post(url, data, { headers });
  return response.data.data.search.announcements.data;
}

// Create Discord embed from listing item
function createEmbed(item) {
  const slugPath = (item.slug || "").startsWith("/")
    ? (item.slug || "").slice(1)
    : item.slug || "";
  return new EmbedBuilder()
    .setTitle(item.title)
    .setURL(`https://www.ouedkniss.com/${slugPath}-d${item.id}`)
    .setDescription(item.description || "No description")
    .addFields(
      {
        name: "Price",
        value: `${item.pricePreview || "N/A"} ${item.priceUnit || ""} (${
          item.priceType || ""
        })`,
        inline: true,
      },
      {
        name: "Location",
        value: `${item.cities?.[0]?.name || "Unknown"}, ${
          item.cities?.[0]?.region?.name || ""
        }`,
        inline: true,
      },
      { name: "ID", value: String(item.id), inline: true },
      { name: "Store", value: item.store?.name || "N/A", inline: true }
    )
    .setImage(item.defaultMedia?.mediaUrl || null)
    .setTimestamp(new Date(item.createdAt));
}

// Register slash commands (guild scoped)
async function registerCommands() {
  if (!DISCORD_BOT_TOKEN || !GUILD_ID) {
    console.warn(
      "Slash commands not registered: missing DISCORD_BOT_TOKEN or GUILD_ID"
    );
    return;
  }
  const favoriteCmd = new SlashCommandBuilder()
    .setName("favorite")
    .setDescription("Save a listing as favorite with a personal note")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Listing id (e.g., 50542423)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("note")
        .setDescription("Your opinion about this offer")
        .setRequired(false)
    );

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  const body = [favoriteCmd.toJSON()];
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
      body,
    });
    console.log("Registered guild slash commands: /favorite");
  } catch (e) {
    console.error("Failed to register slash commands", e);
  }
}

async function checkAndSendNewListings(channel) {
  try {
    let listings = await fetchOuedknissListings();
    listings = listings.filter(
      (item) => item?.defaultMedia && item.defaultMedia.mediaUrl
    );
    let newCount = 0;
    for (const item of listings) {
      // Keep a short-lived cache of recent listings by id for quick lookup when favoriting
      recentById.set(String(item.id), item);
      if (!postedIds.has(item.id)) {
        await channel.send({ embeds: [createEmbed(item)] });
        const slugPath = (item.slug || "").startsWith("/")
          ? (item.slug || "").slice(1)
          : item.slug || "";
        console.log(
          `Sent offer to Discord: id=${item.id}, title="${item.title}", url=https://www.ouedkniss.com/${slugPath}-d${item.id}`
        );
        postedIds.add(item.id);
        newCount++;
      }
    }
    console.log(
      `Poll @ ${new Date().toISOString()} -> fetched=${
        listings.length
      }, sent=${newCount}, skipped=${listings.length - newCount}`
    );
    savePostedIds();
  } catch (error) {
    console.error("Error fetching or sending listings:", error);
  }
}

client.once("clientReady", async () => {
  console.log("Discord bot ready!");
  console.log("Started at : ", new Date().toUTCString());
  loadPostedIds();

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) {
    console.error("Target channel not found");
    return;
  }

  // Register slash commands after login
  await registerCommands();

  // Run immediately once
  await checkAndSendNewListings(channel);

  // Then schedule to run every 10 minutes
  setInterval(() => checkAndSendNewListings(channel), POLL_INTERVAL_MS);
});

client.login(DISCORD_BOT_TOKEN);

// Favorites handling
const {
  readFavorites,
  writeFavorites,
  buildFavoriteEmbed,
} = require("./favorites");

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "favorite") return;

    const id = interaction.options.getString("id", true).trim();
    const note = interaction.options.getString("note") || "";

    // Resolve listing: prefer recent cache, fallback to minimal stub
    const item = recentById.get(id) || {
      id,
      title: `Listing d${id}`,
      slug: "",
      description: "",
    };
    const slugPath = (item.slug || "").startsWith("/")
      ? (item.slug || "").slice(1)
      : item.slug || "";
    const url = `https://www.ouedkniss.com/${
      slugPath ? slugPath + "-" : ""
    }d${id}`;

    const favorite = {
      id,
      url,
      title: item.title,
      pricePreview: item.pricePreview,
      priceUnit: item.priceUnit,
      priceType: item.priceType,
      mediaUrl: item.defaultMedia?.mediaUrl || null,
      city: item.cities?.[0]?.name,
      region: item.cities?.[0]?.region?.name,
      createdAt: item.createdAt || new Date().toISOString(),
      note,
      userId: interaction.user.id,
      userTag: `${interaction.user.username}#${interaction.user.discriminator}`,
      timestamp: Date.now(),
    };

    const favorites = readFavorites();
    favorites.push(favorite);
    writeFavorites(favorites);

    const embed = buildFavoriteEmbed(favorite);

    // Acknowledge to the user (ephemeral)
    await interaction.reply({
      content: `Saved favorite for listing d${id}.`,
      ephemeral: true,
    });

    // Post to favorites channel if configured
    if (FAVORITES_CHANNEL_ID) {
      const favChannel = await client.channels
        .fetch(FAVORITES_CHANNEL_ID)
        .catch(() => null);
      if (favChannel) {
        await favChannel.send({ embeds: [embed] });
      } else {
        console.warn("Favorites channel not found or not accessible");
      }
    }
  } catch (err) {
    console.error("Error handling /favorite:", err);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: "Failed to save favorite.",
          ephemeral: true,
        });
      } catch {}
    }
  }
});
