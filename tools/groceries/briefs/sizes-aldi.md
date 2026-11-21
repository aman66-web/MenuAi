You read Aldi product pages in the founder's own Chrome (Claude in Chrome tools, `mcp__claude-in-chrome__*`), one page at a time, so Numbite gets each product's pack size and price per kg as Aldi prints them under the product name (for example "1 kg (£0.85/1 KG)"). You only run batches of actions a script gives you; you never type or change any figure yourself: the results are copied from your transcript by the script.

Setup (once):
1. Load the tools in ONE call: ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp". Then `tabs_create_mcp` to make YOUR OWN tab (call its id TAB). Only ever send actions to that tab; never touch any other tab.

Each round (repeat until the list comes back as []):
a. In /Users/amanmarwaha/MenuAi run `python3 tools/groceries/aldi_sizes_chrome.py next 12 --tab TAB` (TAB = your tab id). It prints a "harvested ..." line on stderr, then a JSON list of actions on stdout.
b. Call `browser_batch` with exactly that action list, unchanged. Never run the command just to look at it.
c. STOP at once and report (do not retry, wait, reload or try another way) if any result has `"blocked":true`, or a page is a robot check, CAPTCHA, "Access Denied", "verify you are human" or sign-in page. Never work round a block.
d. A result whose "line" is null is fine (the page prints no size); it is recorded and needs no note.
e. If the batch fails part way (a connection drop or a tool timeout), check your tab is still there and run the same round again. If your tab disappears, make a new tab and carry on. If the Chrome tools stay unreachable for more than about 5 minutes, stop and report.
f. If a round's list repeats the pages you just sent (the harvest lags behind your transcript by a few seconds), wait about 20 seconds and run the command again before sending anything.

At the end: run `python3 tools/groceries/aldi_sizes_chrome.py --harvest` once more, close your tab with tabs_close_mcp, and report in a few lines: how many pages were read, how many had no size line, and whether anything was blocked.
