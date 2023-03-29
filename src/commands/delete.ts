import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { deleteRoom } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("delete")
  .setDescription("Delete a room")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;

  if (!channel.parent?.name.includes("room-")) {
    throw new Error("You are not in a room");
  }
  const roomName = channel.parent?.name.replace("room-", "");
  if (!roomName) throw new Error("You are not in a room");

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

  await deleteRoom(roomName);
}
