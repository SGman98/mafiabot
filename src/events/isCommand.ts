import { Events, Interaction } from "discord.js";

export const name = Events.InteractionCreate;
export const once = false;
export const execute = async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    }
  }
};
