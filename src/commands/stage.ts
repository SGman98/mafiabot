import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  Emoji,
  EmojiIdentifierResolvable,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { RoleType, Room, Stage, StageType, Status, getRoomDB } from "../db.js";

import { getChannel } from "../utils.js";

export const data = new SlashCommandBuilder()
  .setName("stage")
  .setDescription("Manage stages")
  .addSubcommand((subcommand) =>
    subcommand.setName("next").setDescription("Start the next stage")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("end").setDescription("End the current stage")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function endStage(
  interaction: ChatInputCommandInteraction,
  room: Room,
  stage: Stage
) {
  const votes = stage.votes.reduce((acc, vote) => {
    if (!acc[vote.to]) acc[vote.to] = 0;
    acc[vote.to]++;
    return acc;
  }, {} as Record<string, number>);
  const maxVotes = Math.max(0, ...Object.values(votes));
  const maxVoted = Object.entries(votes)
    .filter(([, votes]) => votes === maxVotes)
    .map(([user]) => user);

  const maxVotedUser = maxVoted.length === 1 ? maxVoted[0] : undefined;

  const embedFields = [
    {
      name: "Votes",
      value:
        Object.entries(votes)
          .map(([user, votes]) => `<@${user}> received ${votes} votes`)
          .join("\n") || "No votes",
    },
    {
      name: "Total votes",
      value: `${maxVotes}`,
    },
    {
      name: stage.resultPrompt,
      value: maxVotedUser ? `<@${maxVotedUser}>` : "No one",
    },
  ];

  if (stage.type === StageType.Heal && maxVotedUser) {
    const lastKillStage = room.stages[room.stages.length - 2];
    if (!lastKillStage) throw new Error("Could not find the last kill stage");

    const lastKillTarget = lastKillStage.result;

    if (maxVotedUser === lastKillTarget) {
      embedFields.push({
        name: "Heal success",
        value: `You healed <@${maxVotedUser}>`,
      });
    } else {
      embedFields.push({
        name: "Heal did not work",
        value: "You did not heal anyone",
      });
    }
  }

  if (stage.type === StageType.Investigate && maxVotedUser) {
    const maxVotedUserRole = room.players.find(
      (player) => player.id === maxVotedUser
    )?.role;
    if (!maxVotedUserRole) throw new Error("Could not find the user role");

    if (maxVotedUserRole === RoleType.Killer) {
      embedFields.push({
        name: "Investigation result",
        value: `<@${maxVotedUser}> is a killer`,
      });
    } else {
      embedFields.push({
        name: "Investigation result",
        value: `<@${maxVotedUser}> is not a killer`,
      });
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`Stage ended: ${stage.name}`)
    .setColor(Colors.Red)
    .addFields(...embedFields);

  const channel = await getChannel({ interaction, roles: stage.roles });

  await getRoomDB(room.name).push(
    `/stages[${room.stages.length - 1}]/status`,
    Status.Finished
  );
  await getRoomDB(room.name).push(
    `/stages[${room.stages.length - 1}]/result`,
    maxVotedUser
  );

  await channel.send({ embeds: [embed] });

  await interaction.followUp({ content: "Stage ended" });
}

export async function nextStage(
  interaction: ChatInputCommandInteraction,
  room: Room,
  currentStage: Stage | undefined
) {
  const stagesOrder = Object.values(StageType);

  console.log("stages order", stagesOrder);

  const nextStageType = stagesOrder[
    (stagesOrder.indexOf(currentStage?.type || StageType.Vote) + 1) %
      stagesOrder.length
  ] as StageType;

  const stageScenario = room.scenario.stages.find(
    (stage) => stage.type === nextStageType
  );
  if (!stageScenario) throw new Error("Could not find the stage");

  let nextDay = currentStage?.day || 1;
  if (nextStageType === "vote") nextDay++;

  const embeds = [];
  if (nextDay !== currentStage?.day && nextDay !== 1) {
    const previousDayStages = room.stages.filter(
      (stage) => stage.day === nextDay - 1
    );

    const playerKilled = previousDayStages.find(
      (stage) => stage.type === StageType.Kill
    )?.result;
    const playerHealed = previousDayStages.find(
      (stage) => stage.type === StageType.Heal
    )?.result;

    embeds.push(
      new EmbedBuilder()
        .setTitle(`Day ${nextDay - 1} report`)
        .setColor(Colors.Yellow)
        .setDescription(
          "The night has passed\n" +
            (playerKilled
              ? `Someone tried to kill <@${playerKilled}>` +
                (playerHealed === playerKilled
                  ? " but he was saved by the healer"
                  : " and no one saved him")
              : "And everyone was safe")
        )
    );
  }

  const newStage: Stage = {
    name: `${stageScenario.name} - Day ${nextDay}`,
    day: nextDay,
    description: stageScenario.description,
    type: nextStageType,
    status: Status.Playing,
    votes: [],
    roles: stageScenario.roles,
    targets: stageScenario.targets,
    resultPrompt: stageScenario.resultPrompt,
    result: undefined,
  };

  embeds.push(
    new EmbedBuilder()
      .setTitle(`Stage started: ${newStage.name}`)
      .setDescription(newStage.description)
      .setColor(Colors.Green)
      .addFields({
        name: "Voting roles",
        value: newStage.roles
          .map((role) => {
            const roleScenario = room.scenario.roles.find(
              (roleScenario) => roleScenario.type === role
            );
            if (!roleScenario) throw new Error("Could not find the role");
            return roleScenario.name;
          })
          .join(", "),
      })
  );

  const channel = await getChannel({ interaction });
  if (!channel) throw new Error("Could not find the channel");

  await getRoomDB(room.name).push(`/stages[]`, newStage);

  await channel.send({ embeds });

  const roleChannel = await getChannel({ interaction, roles: newStage.roles });
  if (!roleChannel) throw new Error("Could not find the role channel");

  const regionalLettersEmojis = Array.from({ length: 26 }, (_, i) =>
    String.fromCodePoint(0x1f1e6 + i)
  ) as EmojiIdentifierResolvable[];

  const voteEmbed = new EmbedBuilder()
    .setTitle(`Vote for who you want to ${newStage.resultPrompt}`)
    .setDescription(
      room.players
        .map((player, index) => {
          return `${regionalLettersEmojis[index]} <@${player.id}>`;
        })
        .join("\n")
    )
    .setColor(Colors.Green);

  const message = await roleChannel.send({ embeds: [voteEmbed] });

  await Promise.allSettled(
    room.players.map((_, index) => {
      const emoji = regionalLettersEmojis[index];
      if (!emoji) throw new Error("Could not find the emoji");
      return message.react(emoji);
    })
  );

  const collector = message.createReactionCollector({
    filter: () => true,
    time: 1000 * 10,
    dispose: true,
  });

  let results: { [key: string]: number } = {};

  collector.on("collect", (reaction, user) => {
    const player = room.players.find((player) => player.id === user.id);
    if (!player) return console.error("Could not find the player");

    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = room.players[emojiIndex];
    if (!votedPlayer) return console.error("Could not find the voted player");

    console.log(`The player ${player.id} voted for ${votedPlayer.id}`);

    results[votedPlayer.id] ??= 0;
    results[votedPlayer.id]++;
  });

  collector.on("remove", (reaction, user) => {
    const player = room.players.find((player) => player.id === user.id);
    if (!player) return console.error("Could not find the player");

    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = room.players[emojiIndex];
    if (!votedPlayer) return console.error("Could not find the voted player");

    console.log(
      `The player ${player.id} removed his vote for ${votedPlayer.id}`
    );

    results[votedPlayer.id] ??= 1;
    results[votedPlayer.id]--;
  });

  collector.on("end", async () => {
    console.log("end");

    console.log("results", JSON.stringify(results));
  });

  await interaction.editReply({ content: "Stage started" });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;
  if (!channel) throw new Error("Could not find the channel");

  const roomName = channel.parent?.name.replace("room-", "");
  if (!roomName) throw new Error("You are not in a room");

  const room = await getRoomDB(roomName).getObject<Room>("/");

  const currentStage = room.stages[room.stages.length - 1];

  const subcommand = interaction.options.getSubcommand();

  if (currentStage?.status === Status.Playing) {
    await endStage(interaction, room, currentStage);
  }

  if (subcommand === "next") {
    if (room.status === Status.Playing)
      await nextStage(interaction, room, currentStage);
    else
      await interaction.editReply({
        content:
          "It is not possible to start a stage first you have to start the game /start",
      });
  }
}
