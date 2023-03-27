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

  console.log(
    `The user "${interaction.user.tag}" in guild "${interaction.guild?.name}" used command /${interaction.commandName}`
  );

  try {
    await command.execute(interaction);
  } catch (error) {
    console.log(
      `Error executing command /${interaction.commandName}: ${error.message}`
    );
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
