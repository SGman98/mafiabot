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

export interface Vote {
  from: string;
  to: string;
}

export interface Stage {
  type: StageType;
  votes: Vote[];
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

export const db = new JsonDB(new Config("db", true, true, "/"));
