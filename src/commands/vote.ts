import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { Room, Status, db } from "../db.js";
import { endStage } from "./stage.js";

export const data = new SlashCommandBuilder()
  .setName("vote")
  .setDescription("Vote for the current stage")
  .addUserOption((option) =>
    option.setName("user").setDescription("User to vote for").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel as TextChannel;
  if (!channel) throw new Error("Could not find channel");

  const roomName = channel.parent?.name.replace("room-", "");
  if (!roomName) throw new Error("You are not in a room");

  const rooms = await db.getObject<Room[]>("/rooms");
  const room = rooms.find((room) => room.name === roomName);
  if (!room) throw new Error(`Room ${roomName} does not exist`);

  const stage = room.stages[room.stages.length - 1];
  if (!stage) throw new Error("Could not find stage");
  if (stage.status !== Status.Playing) throw new Error("Stage is not active");

  const userRole = room.players.find(
    (player) => player.id === interaction.user.id
  )?.role;
  if (!userRole) throw new Error("Could not find user role");
  if (!stage.roles.includes(userRole))
    throw new Error("You cannot vote in this stage");

  const targetUser = interaction.options.getUser("user")!;
  if (!room.players.find((player) => player.id === targetUser.id)) {
    throw new Error("The user is not in the room");
  }

  const alreadyVoted = stage.votes.find(
    (vote) => vote.from === interaction.user.id
  );

  const targetRole = room.players.find(
    (player) => player.id === targetUser.id
  )?.role;
  if (!targetRole) throw new Error("Could not find target role");
  if (!stage.targets.includes(targetRole))
    throw new Error(`You cannot vote for ${targetRole}`);

  const votes = stage.votes.filter((vote) => vote.from !== interaction.user.id);
  votes.push({ from: interaction.user.id, to: targetUser.id });

  await db.push(
    `/rooms[${rooms.indexOf(room)}]/stages/${room.stages.length - 1}/votes`,
    votes
  );

  const allPlayersVoted = room.players.every((player) => {
    if (!stage.roles.includes(player.role!)) return true;
    return stage.votes.some((vote) => vote.from === player.id);
  });
  if (allPlayersVoted) {
    await endStage(interaction, rooms, room, stage);
  }

  await interaction.editReply({
    content: alreadyVoted
      ? `Voted changed to ${targetUser}`
      : `Voted for ${targetUser}`,
  });
}
