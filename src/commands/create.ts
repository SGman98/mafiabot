import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";

import { Room, Scenario, db } from "../db.js";

const scenarios = await db.getObject<Scenario[]>("/scenarios");

export const data = new SlashCommandBuilder()
  .setName("create")
  .setDescription("Create a room")
  .setName("create")
  .setDescription("Create a room")
  .addStringOption((option) =>
    option
      .setName("room-name")
      .setDescription("The name of the room")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("scenario")
      .setDescription("The scenario to play")
      .setRequired(true)
      .addChoices(
        ...scenarios.map((scenario: any) => ({
          name: scenario.name,
          value: scenario.name,
        }))
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const roomName = interaction.options.getString("room-name")!;
  const scenarioName = interaction.options.getString("scenario")!;

  const rooms = await db.getObject<Room[]>("/rooms");
  if (rooms.find((room) => room.name === roomName))
    throw new Error(`Room ${roomName} already exists`);

  const scenarios = await db.getObject<Scenario[]>("/scenarios");
  const scenario = scenarios.find((scenario) => scenario.name === scenarioName);

  if (!scenario) throw new Error(`Scenario ${scenarioName} does not exist`);

  const role = await interaction.guild?.roles.create({
    name: `room-${roomName}`,
    mentionable: true,
  });

  const category = await interaction.guild?.channels.create({
    name: `room-${roomName}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: interaction.guild?.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: role?.id as string,
        allow: [PermissionsBitField.Flags.ViewChannel],
      },
    ],
  });
  if (!category) throw new Error("Could not create category");

  const vc = await interaction.guild?.channels.create({
    name: "vc",
    type: ChannelType.GuildVoice,
    parent: category,
  });
  if (!vc) throw new Error("Could not create voice channel");
  const tc = await interaction.guild?.channels.create({
    name: "general",
    type: ChannelType.GuildText,
    parent: category,
  });
  if (!tc) throw new Error("Could not create text channel");

  await db.push("/rooms[]", {
    name: roomName,
    scenario,
    players: [],
    stages: [],
    status: "waiting",
  } as Room);

  const embed = new EmbedBuilder()
    .setTitle(`Room: ${roomName}`)
    .setDescription(`Scenario: **${scenarioName}**\n\n${scenario.description}`)
    .addFields(
      {
        name: "Theme",
        value: scenario.theme,
      },
      {
        name: "Stages",
        value: scenario.stages.map((stage) => stage.name).join(" -> "),
      },
      {
        name: "Roles and abilities",
        value: scenario.roles
          .map(
            (role) =>
              role.name +
              " - " +
              role.abilities.map((ability) => ability.name).join(", ")
          )
          .join("\n"),
      }
    )
    .setImage(scenario.image);

  await tc.send({ embeds: [embed] });

  await interaction.editReply(
    `Room ${roomName} created with the scenario ${scenarioName}`
  );
}
