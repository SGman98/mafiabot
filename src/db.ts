import { JsonDB, Config } from "node-json-db";

export enum RoleType {
  Killer = "killer",
  Innocent = "innocent",
  Healer = "healer",
  Investigator = "investigator",
}

export enum StageType {
  Kill = "kill",
  Heal = "heal",
  Investigate = "investigate",
  Vote = "vote",
}

export enum Status {
  Waiting = "waiting",
  Playing = "playing",
  Finished = "finished",
}

export interface Ability {
  name: string;
  description: string;
}

export interface Stage {
  type: StageType;
  status: Status;
  result: string | undefined;
  day: number;
  name: string;
  description: string;
  targets: RoleType[];
  roles: RoleType[];
  resultPrompt: string;
}

export interface StageScenario {
  name: string;
  type: StageType;
  description: string;
  roles: RoleType[];
  targets: RoleType[];
  resultPrompt: string;
}

export interface Role {
  name: string;
  type: RoleType;
  description: string;
  abilities: Ability[];
}

export interface Player {
  id: string;
  role: RoleType | undefined;
}

export interface Scenario {
  name: string;
  theme: string;
  description: string;
  image: string;
  roles: Role[];
  stages: StageScenario[];
}

export interface Room {
  name: string;
  scenario: Scenario;
  players: Player[];
  stages: Stage[];
  status: Status;
}

export interface MafiaDB {
  rooms: Room[];
  scenarios: Scenario[];
}

export function getRoomDB(roomName: string) {
  return new JsonDB(new Config(`db/rooms/${roomName}`, true, true, "/"));
}

export const generalDB = new JsonDB(new Config("db/db", true, true, "/"));

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function getRooms() {
  try {
    const roomNames = fs.readdirSync(path.join(__dirname, "../db/rooms"));
    return await Promise.all(
      roomNames.map(async (roomName) => {
        const room = await getRoomDB(
          roomName.replace(".json", "")
        ).getObject<Room>("/");
        return room;
      })
    );
  } catch (e) {
    console.log("Error while reading rooms", e);
    return [];
  }
}

export async function deleteRoom(roomName: string) {
  try {
    fs.unlinkSync(path.join(__dirname, `../db/rooms/${roomName}.json`));
  } catch (e) {
    console.log("Error while deleting room", e);
  }
}
