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

import {
  Player,
  RoleType,
  Room,
  Stage,
  StageType,
  Status,
  getRoomDB,
} from "../db.js";

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

async function killPlayer({
  interaction,
  playerKilled,
  room,
}: {
  interaction: ChatInputCommandInteraction;
  playerKilled: string;
  room: Room;
}) {
  const player = room.players.find((player) => player.id === playerKilled);
  if (!player) throw new Error("Could not find the player");

  const guildMember = interaction.guild?.members.cache.get(player.id);
  if (!guildMember) throw new Error("Could not find the guild member");

  if (player.role === RoleType.Innocent) {
    const roleChannel = await getChannel({
      interaction,
      roles: [player.role!],
      roomName: room.name,
    });
    await roleChannel.permissionOverwrites.delete(guildMember, "Dead player");
  }

  const generalChannel = await getChannel({ interaction, roomName: room.name });

  const deadPlayerEmbed = new EmbedBuilder()
    .setTitle("Player died")
    .setColor(Colors.Red)
    .setDescription(
      `The player ${guildMember} has died` +
        (player.role === RoleType.Killer &&
          `, whose role was: **${
            room.scenario.roles.find((role) => role.type === player.role)?.name
          }**`)
    );

  await generalChannel.send({ embeds: [deadPlayerEmbed] });

  const playerIdx = room.players.findIndex(
    (player) => player.id === playerKilled
  );
  await getRoomDB(room.name).push(`/players[${playerIdx}]/role`, RoleType.Dead);
}
function collectorOnEnd({
  interaction,
  collector,
  results,
  room,
  message,
  newStage: stage,
}: {
  interaction: ChatInputCommandInteraction;
  collector: ReactionCollector;
  results: Record<string, number>;
  voteEmbed: EmbedBuilder;
  room: Room;
  message: Message;
  newStage: Stage;
}) {
  collector.on("end", async () => {
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
    console.log(`Stage ${stage.name} ended with result ${result}`);

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

    if (stage.type === StageType.Vote && result) {
      await killPlayer({ interaction, playerKilled: result, room });
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
  alivePlayers,
  results,
}: {
  collector: ReactionCollector;
  alivePlayers: Player[];
  results: Record<string, number>;
}) {
  collector.on("remove", async (reaction, user) => {
    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = alivePlayers[emojiIndex];
    if (!votedPlayer) return console.error("Could not find the voted player");

    console.log(`The player ${user.id} removed his vote for ${votedPlayer.id}`);

    results[votedPlayer.id] ??= 1;
    results[votedPlayer.id]--;
  });
}

function collectorOnCollect({
  collector,
  alivePlayers,
  results,
}: {
  collector: ReactionCollector;
  alivePlayers: Player[];
  results: Record<string, number>;
}) {
  collector.on("collect", (reaction, user) => {
    const emojiIndex = regionalLettersEmojis.findIndex(
      (emoji) => emoji === reaction.emoji.name
    );
    if (emojiIndex === -1) return console.error("Could not find the emoji");

    const votedPlayer = alivePlayers[emojiIndex];
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
  const previousDayStages = room.stages.filter(
    (stage) => stage.day === nextDay - 1
  );

  const playerKilled = previousDayStages.find(
    (stage) => stage.type === StageType.Kill
  )?.result;
  const playerHealed = previousDayStages.find(
    (stage) => stage.type === StageType.Heal
  )?.result;

  if (nextDay !== currentStage?.day && nextDay !== 1) {
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

  const aliveInnocents = room.players.filter(
    (player) => player.role !== RoleType.Killer && player.role !== RoleType.Dead
  );
  const aliveKillers = room.players.filter(
    (player) => player.role === RoleType.Killer
  );

  const channel = await getChannel({ interaction });
  if (!channel) throw new Error("Could not find the channel");

  if (aliveKillers.length === 0) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("Game over")
        .setColor(Colors.Green)
        .setDescription(
          `The town won:\n\n${aliveInnocents
            .map((player) => `<@${player.id}>`)
            .join("\n")}`
        )
    );
    await channel.send({ embeds });
    await interaction.editReply({ content: "Game over" });
    await getRoomDB(room.name).push("/status", Status.Finished);
    return;
  }

  if (aliveKillers.length >= aliveInnocents.length) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("Game over")
        .setColor(Colors.Red)
        .setDescription(
          `The killers won:\n\n${aliveKillers
            .map((player) => `<@${player.id}>`)
            .join("\n")}`
        )
    );
    await channel.send({ embeds });
    await interaction.editReply({ content: "Game over" });
    await getRoomDB(room.name).push("/status", Status.Finished);
    return;
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

  await channel.send({ embeds });
  console.log(`Stage started: ${newStage.name}`);

  if (playerKilled && playerHealed !== playerKilled) {
    await killPlayer({ interaction, room, playerKilled });
  }

  await getRoomDB(room.name).push(`/stages[]`, newStage);

  const roleChannel = await getChannel({ interaction, roles: newStage.roles });
  if (!roleChannel) throw new Error("Could not find the role channel");

  const players = await getRoomDB(room.name).getObject<Player[]>("/players");
  if (!players) throw new Error("Could not find the players");

  const alivePlayers = players.filter(
    (player) => player.role !== RoleType.Dead
  );

  const voteEmbed = new EmbedBuilder()
    .setTitle(
      `Votation started: ${newStage.name} - Duration: ${ms(
        ms(stageScenario.duration),
        { long: true }
      )}`
    )
    .setDescription(
      alivePlayers
        .map((player, index) => {
          return `${regionalLettersEmojis[index]} <@${player.id}>`;
        })
        .join("\n")
    )
    .setColor(Colors.Green);

  const message = await roleChannel.send({ embeds: [voteEmbed] });

  await Promise.allSettled(
    alivePlayers.map((_, index) => {
      const emoji = regionalLettersEmojis[index];
      if (!emoji) throw new Error("Could not find the emoji");
      return message.react(emoji);
    })
  );

  const collector = message.createReactionCollector({
    filter: (_, user) => {
      const isBot = user.id === message.author.id;
      const isAlive = alivePlayers.some((player) => player.id === user.id);
      return !isBot && isAlive;
    },

    dispose: true,
  });

  let results: Record<string, number> = {};

  collectorOnCollect({ collector, results, alivePlayers });
  collectorOnRemove({ collector, results, alivePlayers });
  collectorOnEnd({
    interaction,
    collector,
    room,
    voteEmbed,
    results,
    message,
    newStage,
  });

  await interaction.editReply({ content: "Stage started" });

  let pace = 10000;
  let changePace = pace;
  let timeLeft = ms(stageScenario.duration);
  let timer = setInterval(timerFunction, pace);

  async function timerFunction() {
    timeLeft -= pace;

    if (timeLeft <= 0) {
      clearInterval(timer);
      collector.stop();
      await message.reactions.removeAll();
      return;
    }

    if (timeLeft <= changePace) {
      clearInterval(timer);
      pace = 1000;
      timer = setInterval(timerFunction, pace);
    }

    voteEmbed.setTitle(
      `Votation started: ${newStage.name} - Time left: ${ms(timeLeft, {
        long: true,
      })}`
    );

    await message.edit({ embeds: [voteEmbed] });
  }
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
    if (room.status === Status.Playing) {
      await nextStage(interaction, room, currentStage);
    } else if (room.status === Status.Finished) {
      await interaction.editReply({
        content: "The game is finished",
      });
    } else {
      await interaction.editReply({
        content:
          "It is not possible to start a stage first you have to start the game /start",
      });
    }
  }
}
