import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  EmojiIdentifierResolvable,
  Message,
  PermissionFlagsBits,
  ReactionCollector,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import ms from "ms";

import { RoleType, Room, Stage, StageType, Status, getRoomDB } from "../db.js";

import { getChannel } from "../utils.js";

const regionalLettersEmojis = Array.from({ length: 26 }, (_, i) =>
  String.fromCodePoint(0x1f1e6 + i)
) as EmojiIdentifierResolvable[];

export const data = new SlashCommandBuilder()
  .setName("stage")
  .setDescription("Manage stages")
  .addSubcommand((subcommand) =>
    subcommand.setName("next").setDescription("Start the next stage")
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function collectorOnEnd({
  collector,
  results,
  room,
  message,
  newStage: stage,
}: {
  collector: ReactionCollector;
  results: Record<string, number>;
  voteEmbed: EmbedBuilder;
  room: Room;
  message: Message;
  newStage: Stage;
}) {
  collector.on("end", async () => {
    console.log("Collector ended");
    const maxVotes = Math.max(0, ...Object.values(results));

    const playersWithMaxVotes = Object.entries(results)
      .filter(([, votes]) => votes === maxVotes)
      .map(([playerId]) => playerId);

    const result =
      playersWithMaxVotes[
      Math.floor(Math.random() * playersWithMaxVotes.length)
      ];

    room = await getRoomDB(room.name).getObject<Room>("/");

    await getRoomDB(room.name).push(
      `/stages/${room.stages.length - 1}/result`,
      result
    );
    console.info(`Stage ${stage.name} ended with result ${result}`);

    const embedFields = [
      {
        name: "Votes",
        value:
          Object.entries(results)
            .map(([playerId, votes]) => {
              return `<@${playerId}>: received ${votes} votes`;
            })
            .join("\n") || "Nobody voted",
      },
      {
        name: "Total votes",
        value: Object.values(results)
          .reduce((a, b) => a + b, 0)
          .toString(),
      },
      {
        name: stage.resultPrompt,
        value: result ? `<@${result}>` : "Nobody",
      },
    ];

    if (stage.type === StageType.Heal && result) {
      const lastKillStageResult = room.stages[room.stages.length - 2]?.result;
      embedFields.push({
        name: lastKillStageResult === result ? "Heal success" : "Heal failed",
        value:
          lastKillStageResult === result
            ? `<@${result}> was healed`
            : `<@${result}> didn't need to be healed`,
      });
    }

    if (stage.type === StageType.Investigate && result) {
      const targetIsKiller = room.players.some(
        (player) => player.id === result && player.role === RoleType.Killer
      );

      embedFields.push({
        name: "Investigation result",
        value: targetIsKiller
          ? `<@${result}> is a killer`
          : `<@${result}> is not a killer`,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Stage ended: ${stage.name}`)
      .setColor(Colors.Red)
      .addFields(...embedFields);

    await message.edit({
      embeds: [embed],
    });
  });
}

function collectorOnRemove({
  collector,
  room,
  results,
}: {
  collector: ReactionCollector;
  room: Room;
  results: Record<string, number>;
}) {
  collector.on("remove", async (reaction, user) => {
    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = room.players[emojiIndex];
    if (!votedPlayer) return console.error("Could not find the voted player");

    console.log(`The player ${user.id} removed his vote for ${votedPlayer.id}`);

    results[votedPlayer.id] ??= 1;
    results[votedPlayer.id]--;
  });
}

function collectorOnCollect({
  collector,
  room,
  results,
}: {
  collector: ReactionCollector;
  room: Room;
  results: Record<string, number>;
}) {
  collector.on("collect", (reaction, user) => {
    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = room.players[emojiIndex];
    if (!votedPlayer) return console.error("Could not find the voted player");

    console.log(`The player ${user.id} voted for ${votedPlayer.id}`);

    results[votedPlayer.id] ??= 0;
    results[votedPlayer.id]++;
  });
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

  const voteEmbed = new EmbedBuilder()
    .setTitle(
      `Votation started: ${newStage.name} - Duration: ${ms(
        ms(stageScenario.duration),
        { long: true }
      )}`
    )
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
    filter: (_, user) => user.id !== message.author.id,
    // time: stageScenario.duration * 1000 * 60,
    dispose: true,
  });

  let results: Record<string, number> = {};

  collectorOnCollect({ collector, results, room });
  collectorOnRemove({ collector, results, room });
  collectorOnEnd({ collector, room, voteEmbed, results, message, newStage });

  await interaction.editReply({ content: "Stage started" });

  let timeLeft = ms(stageScenario.duration);
  const timer = setInterval(async () => {
    timeLeft -= 10000;

    if (timeLeft <= 0) {
      clearInterval(timer);
      collector.stop();
      await message.reactions.removeAll();
      return;
    }

    voteEmbed.setTitle(
      `Votation started: ${newStage.name} - Duration: ${ms(timeLeft, {
        long: true,
      })}`
    );

    await message.edit({ embeds: [voteEmbed] });
  }, 10000);
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
