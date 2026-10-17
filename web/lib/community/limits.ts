// The numbers behind Community (docs/BACKEND.md "Community" has the table). Pure, so the app can say "up to 200 friends" from the same constants the API enforces.
// The three caps that must hold under a race (unread lists, waiting requests, friends) are repeated as triggers in supabase/migrations/20261016120000_community.sql:
// change both together.

export const MAX_FRIENDS = 200;
/** Friend-code tries a day, right or wrong (every real request starts as one, so this also bounds the requests a person can make). Counted in the database. */
export const MAX_CODE_TRIES_PER_DAY = 20;
/** Requests I made that haven't been answered. */
export const MAX_PENDING_OUT = 50;
/** Requests waiting for one person to answer, from everyone together (a code that leaked can't bury somebody). */
export const MAX_PENDING_IN = 100;
/** Shopping lists sent a day, to all friends together. Counted in the database. */
export const MAX_SENDS_PER_DAY = 30;
/** Shopping lists sent to one friend a day, whether or not they have opened them (so a refusal says nothing about what the friend did). Counted in the database. */
export const MAX_SENDS_TO_ONE_PER_DAY = 10;
/** Unread lists in one inbox. */
export const MAX_UNREAD = 50;
export const MAX_REPORTS_PER_DAY = 10;
/** A list waits this long in the inbox. */
export const INBOX_DAYS = 30;
/** The most items GET inbox returns. */
export const INBOX_PAGE = 100;
/** A request turned down is remembered this long, so the same person can't ask again at once. */
export const DECLINED_DAYS = 30;
/** Daily tallies are kept this long (the limits look back one day). */
export const TALLY_DAYS = 2;
/** A report that is no longer open is deleted this long after it was made. */
export const REPORT_KEEP_DAYS = 365;
