import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { deleteRoom } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("delete")
  .setDescription("Delete a room")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    throw new Error("You don't have permission to start the room");
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;

  const roomName = channel.parent?.name.replace("room-", "");
  if (!roomName) throw new Error("Room name not found");

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
