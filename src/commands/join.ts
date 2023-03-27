import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { db, Player, Room } from "../db.js";
import { getChannel } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join a room");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const rooms = await db.getObject<Room[]>("/rooms");

  const inRoom = rooms.find((room) =>
    room.players.find((player) => player.id === interaction.user.id)
  );
  if (inRoom) throw new Error(`You are already in the room ${inRoom.name}`);

  const room = rooms
    .filter((room) => room.status === "waiting")
    .sort(() => Math.random() - 0.5)
    .sort((a, b) => a.players.length - b.players.length)[0];
  if (!room) throw new Error("There are no available rooms");

  const role = interaction.guild?.roles.cache.find(
    (r) => r.name === `room-${room.name}`
  );
  if (!role) throw new Error("Could not find the role of the room");
  await interaction.guild?.members.cache
    .get(interaction.user.id)
    ?.roles.add(role);

  const tc = await getChannel({ interaction, roomName: room.name });
  if (!tc) throw new Error("Could not find the text channel of the room");

  await db.push(`/rooms[${rooms.indexOf(room)}]/players[]`, {
    id: interaction.user.id,
    role: undefined,
  } as Player);

  await interaction.editReply(
    `You have joined the room ${room.name}, go to ${tc}`
  );

  const joinEmbed = new EmbedBuilder()
    .setTitle(`${interaction.user.tag} joined the room`)
    .setDescription(`Everyone welcome <@${interaction.user.id}>`)
    .setColor(null)
    .addFields({
      name: "Party size",
      value: `\`${room.players.length}\``,
    })
    .setTimestamp()
    .setThumbnail(interaction.user.avatarURL());

  if (tc.isTextBased()) await tc.send({ embeds: [joinEmbed] });
}
