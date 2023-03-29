import {
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { RoleType, Room, Status, getRoomDB } from "../db.js";
import { getChannel } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Start a room")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;

  if (!channel.parent?.name.includes("room-")) {
    throw new Error("You are not in a room");
  }
  const roomName = channel.parent?.name.replace("room-", "");
  if (!roomName) throw new Error("You are not in a room");

  const room = await getRoomDB(roomName).getObject<Room>("/");

  // if (room.players.length < 4) {
  //   throw new Error("La sala debe tener al menos 4 jugadores");
  // }

  const roles = room.scenario.roles;
  const mafiaCount = Math.round(room.players.length / 4);

  const playersRandomized = room.players.sort(() => Math.random() - 0.5);

  playersRandomized.forEach((player, index) => {
    let role;

    if (index === 0) role = RoleType.Healer;
    else if (index === 1) role = RoleType.Investigator;
    else if (index < mafiaCount + 2) role = RoleType.Killer;
    else role = RoleType.Innocent;

    return (player.role = role);
  });

  for (const role of roles ?? []) {
    let roleChannel;
    if (role.type !== RoleType.Innocent) {
      const players = playersRandomized
        .filter((player) => player.role === role.type)
        .map((player) => interaction.guild?.members.cache.get(player.id))
        .filter((member) => member) as GuildMember[];

      const existingChannel = interaction.guild?.channels.cache.find(
        (c) =>
          c.name === `role-${role.name.toLowerCase()}` &&
          c.parentId === channel.parentId
      );

      if (existingChannel && existingChannel.isTextBased()) {
        roleChannel = existingChannel;
      } else {
        const newChannel = await interaction.guild?.channels.create({
          name: `role-${role.name}`,
          type: ChannelType.GuildText,
          parent: channel.parent,
          permissionOverwrites: [
            {
              id: interaction.guild?.id,
              deny: PermissionFlagsBits.ViewChannel,
            },
            ...players.map((member) => ({
              id: member.id,
              allow: PermissionFlagsBits.ViewChannel,
            })),
          ],
        });
        if (!newChannel)
          throw new Error(`Could not create channel ${role.name}`);
        roleChannel = newChannel;
      }
    } else {
      roleChannel = await getChannel({ interaction });
    }

    const embedColor = {
      healer: Colors.Green,
      investigator: Colors.Blue,
      killer: Colors.Red,
      innocent: Colors.Grey,
      dead: Colors.Purple,
    };

    const roleColor = embedColor[role.type] ?? Colors.Default;

    const roleEmbed = new EmbedBuilder()
      .setTitle(`Your role is: ${role.name}`)
      .setDescription(role.description)
      .setColor(roleColor);
    const abilitiesEmbed = new EmbedBuilder()
      .setTitle("Your abilities are:")
      .setColor(roleColor)
      .addFields(
        ...role.abilities.map((ability) => ({
          name: ability.name,
          value: ability.description,
        }))
      );

    await roleChannel.send({
      content:
        `@here If you are reading this, your role is **${role.name}**` +
        (role.type === RoleType.Innocent
          ? " if you have another role, don't tell anyone"
          : " use this channel for your role commands"),
      embeds: [roleEmbed, abilitiesEmbed],
    });

    await getRoomDB(roomName).push(`/players`, playersRandomized);
    await getRoomDB(roomName).push(`/status`, Status.Playing);
  }

  await interaction.editReply(`Room ${roomName} started`);
}
