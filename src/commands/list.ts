import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

import { getRooms } from "../db.js";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("List rooms");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const rooms = await getRooms();

  const fields = rooms
    .map((room) => {
      return [
        { name: "Room", value: room.name, inline: true },
        { name: "Scenario", value: room.scenario.name, inline: true },
        { name: "Players", value: `${room.players.length}`, inline: true },
      ];
    })
    .flat();

  const embed = new EmbedBuilder()
    .setTitle("Rooms")
    .setDescription("List of rooms")
    .setColor(Colors.Gold)
    .addFields(...fields);

  await interaction.editReply({ embeds: [embed] });
}
