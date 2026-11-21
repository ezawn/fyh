/**
 * HTTP API between the web app (Vite, :5173) and the server (Express, :3001).
 * Part of the contract: change only on a branch, and tell the team first.
 *
 *   GET  /api/cartridges          -> CartridgeSummary[]   (library, newest first)
 *   GET  /api/cartridges/:id      -> Cartridge
 *   POST /api/cartridges          GenerateRequest -> Cartridge   (AI generates + saves)
 *   POST /api/remix               RemixRequest    -> Cartridge   (AI powerscales + saves)
 *
 * Errors: any non-2xx returns ApiError.
 */
import type { Cartridge } from "./cartridge";

export type CartridgeSummary = {
  id: string;
  title: string;
  source: string;
  coverColor: string;
  characterName: string;
  worldName: string;
  isRemix: boolean;
  createdAt: string;
};

export type GenerateRequest = {
  title: string; // what the user typed, e.g. "Dracula"
  synopsis: string; // pasted plot summary / episode synopsis
};

export type RemixRequest = {
  characterFrom: string; // cartridge id to take the character from
  worldFrom: string; // cartridge id to take the world from
};

export type ApiError = { error: { code: string; message: string } };

export function toSummary(c: Cartridge): CartridgeSummary {
  return {
    id: c.id,
    title: c.title,
    source: c.source,
    coverColor: c.coverColor,
    characterName: c.character.name,
    worldName: c.world.name,
    isRemix: !!c.remix,
    createdAt: c.createdAt,
  };
}
