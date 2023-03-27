import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  TextChannel,
} from "discord.js";
import { RoleType, Room, db } from "./db.js";

export async function loadCommands() {
  const commands = new Collection();

  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);

    if (!command.data || !command.execute) {
      console.error(`Command ${file} does not export data or execute`);
      continue;
    }

    commands.set(command.data.name, command);

    console.log(`Command ${file} loaded`);
  }

  return commands;
}

export async function loadEvents(client: Client) {
  const events = new Collection();

  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = await import(filePath);

    if (!event.name || !event.execute) {
      console.error(`Event ${file} does not export name or execute`);
      continue;
    }

    if (!event.once) client.on(event.name, event.execute);
    else client.once(event.name, event.execute);

    console.log(`Event ${file} loaded`);
  }

  return events;
}

export function chunk(array: any[], size: number) {
  const chunked_arr = [];
  let index = 0;
  while (index < array.length) {
    chunked_arr.push(array.slice(index, size + index));
    index += size;
  }
  return chunked_arr;
}

export async function getChannel({
  interaction,
  roles = undefined,
  roomName = undefined,
}: {
  interaction: ChatInputCommandInteraction;
  roles?: RoleType[] | undefined;
  roomName?: string | undefined;
}) {
  if (!roomName) {
    const interactionChannel = interaction.channel as TextChannel;
    if (!interactionChannel) throw new Error("Channel not found");
    roomName = interactionChannel.parent?.name.replace("room-", "");
  }
  if (!roomName) throw new Error("Room name not found");

  const roomChannels = interaction.guild?.channels.cache.filter(
    (channel) => channel.parent?.name === `room-${roomName}`
  );
  if (!roomChannels) throw new Error("Room channels not found");

  const rooms = await db.getObject<Room[]>("/rooms");
  const room = rooms.find((room) => room.name === roomName);
  if (!room) throw new Error(`Room ${roomName} does not exist`);

  let channel: TextChannel;
  if (!roles || roles.includes(RoleType.Innocent)) {
    const innocentChannel = roomChannels.find(
      (channel) => channel.name === "general"
    );
    if (!innocentChannel) throw new Error("Innocent channel not found");
    channel = innocentChannel as TextChannel;
  } else {
    const roleNames = room.scenario.roles
      .filter((role) => roles.includes(role.type))
      .map((role) => role.name)[0]; // ignore multiple roles for now

    const roleChannel = roomChannels.find(
      (channel) => channel.name === `role-${roleNames?.toLowerCase()}`
    );
    if (!roleChannel) throw new Error("Role channel not found");
    channel = roleChannel as TextChannel;
  }
  return channel;
}
