import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { Room, db } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List rooms");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const rooms = await db.getObject<Room[]>("/rooms");

  const embed = new EmbedBuilder()
    .setTitle("Rooms")
    .setDescription("List of rooms")
    .setColor(Colors.Gold)
    .addFields(
      ...rooms.map((room) => ({
        name: room.name,
        value: `Scenario: ${room.scenario} - Players: ${room.players.length}`,
      }))
    );

  await interaction.editReply({ embeds: [embed] });
}
