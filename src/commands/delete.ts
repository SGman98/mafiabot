import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { db, Room } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("delete")
  .setDescription("Delete a room")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;

  const rooms = await db.getObject<Room[]>("/rooms");

  const roomName = channel.parent?.name.replace("room-", "");
  const room = rooms.find((room) => room.name === roomName);
  if (!room) throw new Error(`Room ${roomName} does not exist`);

  const children = interaction.guild?.channels.cache.filter(
    (c) => c.parentId === channel.parentId
  );
  await Promise.allSettled(children?.map((channel) => channel.delete()) ?? []);
  await channel.parent?.delete();

  const role = interaction.guild?.roles.cache.find(
    (role) => role.name === `room-${roomName}`
  );
  if (!role) throw new Error("Role not found");
  await role.delete();

  await db.delete(`/rooms[${rooms.indexOf(room)}]`);
}
