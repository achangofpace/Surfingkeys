# [Feat] Allow for tab sorting in current window

## Summary

This PR adds the ability to sort tabs by URL in the current window in both Chrome and Firefox.

## Why

Once I have over 30 tabs, it's nice to have a way to arrange them so I can split them into tab groups more easily.

## What this PR adds

(in order of execution)

### `src/content_scripts/common/default.js > registerTabArrangementMappings`

I've provided some default mappings for the tab arrangement functionality.
These mappings are more intended as a demonstration rather than needing them to be available by default.

### `src/background/start.js > self.arrangeTabs`

It's not possible to call any browser extension API methods directly from the user configurations that get injected into the content script context.

Instead, `api.RUNTIME` uses the extension messaging system to call wrapped browser extension methods in the background script.

These wrapped methods must be defined in the source code ahead of time.

### `src/common/utils.js > sortTabsBy and TabComparison`

I had originally intended to define sort functions from the user settings.

Sending code from the content script to the background script is techincally possible (you could have the code sent across as a string and then convert that string back to a function) but highly discouraged (iirc the browser either warns you or just throws an error if you don't hack it correctly).

I've added functions to compare tabs' titles, url, and time last accessed.

These functions can be used in sortTabsBy to sort any array of tabs.

In the context of this feature, the array will be the list of open tabs in the current window.

## Docs

- Added:
    - `docs/runtime_actions.md`
    - includes list of runtime_actions available to be called using `RUNTIME`

## Validation

- `npm run build:dev` and manual testing in chrome
    - [link to gif]()
- `browser=firefox npm run build:dev` and manual testing in firefox
    - [link to gif]()
