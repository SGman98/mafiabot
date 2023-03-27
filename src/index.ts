import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";

import { loadCommands, loadEvents } from "./utils.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.events = await loadEvents(client);
client.commands = await loadCommands();

client.login(process.env.TOKEN);
