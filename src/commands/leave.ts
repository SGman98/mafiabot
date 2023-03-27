import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getRoomDB, getRooms } from "../db.js";
import { getChannel } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Leave a room");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const rooms = await getRooms();
  const room = rooms.find((room) =>
    room.players.find((player) => player.id === interaction.user.id)
  );
  if (!room) throw new Error("You are not in a room");

  const role = interaction.guild?.roles.cache.find(
    (r) => r.name === `room-${room.name}`
  );
  if (!role) throw new Error("Role not found");
  await interaction.guild?.members.cache
    .get(interaction.user.id)
    ?.roles.remove(role);

  room.players = room.players.filter(
    (player) => player.id !== interaction.user.id
  );

  await getRoomDB(room.name).push("/players", room.players);

  const tc = await getChannel({ interaction, roomName: room.name });
  await tc.send({ content: `${interaction.user} has left the room` });

  await interaction.editReply(`You have left the room ${room.name}`);
}
