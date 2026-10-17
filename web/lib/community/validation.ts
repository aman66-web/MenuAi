import { z } from "zod";
import { REPORT_REASONS } from "./types";

// Bodies the Community routes accept. Keep in sync with docs/BACKEND.md "Community".

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const uuid = z.string().regex(UUID, "an id");

export const MAX_NOTE_LENGTH = 500;

/** Control characters and the invisible ones that reorder text: not part of a note. */
const NOT_TEXT = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;

export const usernameBodySchema = z.object({ username: z.string().max(100) });

export const requestBodySchema = z.object({ code: z.string().max(100) });

export const respondBodySchema = z.object({ id: uuid, accept: z.boolean() });

/** Exactly one of the handles: a friendship row (friend, request in or out) or an inbox item. */
export const blockBodySchema = z
  .object({ friendId: uuid.optional(), listId: uuid.optional() })
  .refine((b) => [b.friendId, b.listId].filter((x) => x !== undefined).length === 1, { message: "give exactly one of friendId, listId" });

export const reportBodySchema = z
  .object({
    friendId: uuid.optional(),
    listId: uuid.optional(),
    blockId: uuid.optional(),
    reason: z.enum(REPORT_REASONS),
    note: z.string().max(MAX_NOTE_LENGTH).optional(),
    /** Also block the person (after the report is saved, so the evidence is kept). */
    block: z.boolean().optional(),
  })
  .refine((b) => [b.friendId, b.listId, b.blockId].filter((x) => x !== undefined).length === 1, { message: "give exactly one of friendId, listId, blockId" });

export const sendListBodySchema = z.object({ friendId: uuid, payload: z.string().min(1).max(20000) });

/** Half of an emoji (a lone surrogate) taken out. A JSON body can carry one, and Postgres refuses to store text that has one, which would lose the whole report. */
export const wholeCharacters = (text: string): string => Array.from(text).filter((c) => !(c.length === 1 && c >= "\uD800" && c <= "\uDFFF")).join("");

/** A report's note: tidied, at most 500 whole characters, null when nothing is left. */
export function cleanNote(note: string | undefined): string | null {
  if (note === undefined) return null;
  const text = wholeCharacters(note).normalize("NFKC").replace(NOT_TEXT, " ").replace(/[ \t]+/g, " ").trim();
  const cut = Array.from(text).slice(0, MAX_NOTE_LENGTH).join("").trim();
  return cut === "" ? null : cut;
}

