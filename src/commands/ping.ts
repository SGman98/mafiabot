import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!");

export async function execute(interaction: CommandInteraction) {
  await interaction.reply({
    content: `Pong! ${interaction.client.ws.ping}ms`,
    ephemeral: true,
  });
}
