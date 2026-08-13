function LOG(level, msg) {
    // To turn on all levels: chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})
    chrome.storage.local.get(["logLevels"], (r) => {
        const logLevels = r && r.logLevels || ["error"];
        if (["log", "warn", "error"].indexOf(level) !== -1 && logLevels.indexOf(level) !== -1) {
            console[level](msg);
        }
    });
}

function regexFromString(str, caseSensitive, highlight) {
    var rxp = null;
    const flags = caseSensitive ? "" : "i";
    str = str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    if (highlight) {
        rxp = new RegExp(str.replace(/\s+/, "\|"), flags);
    } else {
        var words = str.split(/\s+/).map(function(w) {
            return `(?=.*${w})`;
        }).join('');
        rxp = new RegExp(`^${words}.*$`, flags);
    }
    return rxp;
}

function filterByTitleOrUrl(urls, query, caseSensitive) {
    if (query && query.length) {
        var rxp = regexFromString(query, caseSensitive, false);
        urls = urls.filter(function(b) {
            return rxp.test(b.title) || rxp.test(b.url);
        });
    }
    return urls;
}

/**
 * @typedef {Object} TabModel
 * @property {number} id
 * @property {string} title
 * @property {string} url
 * @property {string} favIconUrl
 * @property {boolean} active
 * @property {number} index
 */

/**
 * @typedef {tabs.TabGroup & {
 *  tabs: TabModel[]
 * }} TabGroupModel
 */

/**
 * get all tab groups with constituent tab information included
 * @param {number} sender_tab_id
 * @returns {Promise<TabGroupModel[]>}
 */
async function getTabGroups (sender_tab_id) {
    // Promise.all([
        // chrome.tabGroups.query({}),
        // chrome.tabs.query({})
    // ])
    // .then(([groups, tabs]) => {
    let [groups, tabs] = await Promise.all([
        queryTabGroups({}),
        queryTabs({})
    ]);
        // retrieve all tabs of each group
        let activeGroup = -1;
        const tabGroups = new Map();
        tabs.forEach(function(tab) {
            if (
                tab.groupId &&
                tab.groupId !== (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1)
            ) {
                if (!tabGroups.has(tab.groupId)) {
                    tabGroups.set(tab.groupId, []);
                }
                if (tab.id === sender_tab_id) {
                    activeGroup = tab.groupId;
                }
                tabGroups.get(tab.groupId).push({
                    id: tab.id,
                    title: tab.title,
                    url: tab.url,
                    favIconUrl: tab.favIconUrl,
                    active: tab.active,
                    index: tab.index
                });
            }
        });

        groups = groups.filter((g) => !g.hermit);
        groups.forEach(function(group) {
            group.tabs = tabGroups.get(group.id) || [];
            group.active = group.id === activeGroup;
        });

        return groups;
    // });
}

function queryTabs(filters) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query(filters, (tabs) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(tabs);
        });
    });
}

function queryTabGroups(filters) {
    return new Promise((resolve, reject) => {
        chrome.tabGroups.query(filters, (groups) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(groups);
        });
    });
}

function moveTabs(tabIds, moveProps) {
    return new Promise((resolve, reject) => {
        chrome.tabs.move(tabIds, moveProps, (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });
}

function moveTabGroups(groupIds, moveProps) {
    return new Promise((resolve, reject) => {
        chrome.tabGroups.move(groupIds, moveProps, (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });
}

function getTabGroupsCallbacks (sender_tab_id) {
// function getTabGroups (sender_tab_id) {
    chrome.tabGroups.query({}, function(groups) {
        let activeGroup = -1;
        // retrieve all tabs of each group
        chrome.tabs.query({}, function(tabs) {
            const tabGroups = new Map();
            tabs.forEach(function(tab) {
                if (
                    tab.groupId &&
                    tab.groupId !== (chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1)
                ) {
                    if (!tabGroups.has(tab.groupId)) {
                        tabGroups.set(tab.groupId, []);
                    }
                    if (tab.id === sender_tab_id) {
                        activeGroup = tab.groupId;
                    }
                    tabGroups.get(tab.groupId).push({
                        id: tab.id,
                        title: tab.title,
                        url: tab.url,
                        favIconUrl: tab.favIconUrl,
                        active: tab.active,
                        index: tab.index
                    });
                }
            });

            groups = groups.filter((g) => !g.hermit);
            groups.forEach(function(group) {
                group.tabs = tabGroups.get(group.id) || [];
                group.active = group.id === activeGroup;
            });

            return groups;
        });
    });
}

const SortByOptions = {
    RECENCY: "recency",
    SIZE: "size",
    TITLE: "title",
    URL: "url"
};
const MoveToOptions = {
    FRONT: "front",
    BACK: "back"
};
const DEFAULT_OPTIONS_UNGROUPED_TABS = {
    sort_by: SortByOptions.URL,
    ascending: true
};
const DEFAULT_OPTIONS_TAB_GROUPS = {
    move_to: MoveToOptions.FRONT,
    sort_by: SortByOptions.RECENCY,
    ascending: true
};

/**
 * Tab comparison functions
 * @param {tabs.Tab} tab_a
 * @param {tabs.Tab} tab_b
 * @param {boolean} asc sort direction, ascending if true or descending if false
 * @returns {Number} A negative number if `tab_a` comes before `tab_b`, 0 if they're the same value, and a positive number if `tab_b` comes before `tab_a`
 */
const TabComparators = {
    compareAccessRecency(tab_a, tab_b, asc = true) {
        return (asc ? 1 : -1) * (tab_a.lastAccessed - tab_b.lastAccessed);
    },
    compareTitle(tab_a, tab_b, asc = true) {
        return (asc ? 1 : -1) * tab_a.title.localeCompare(tab_b.title);
    },
    compareURL(tab_a, tab_b, asc = true) {
        const hostCmp = tab_a.hostname.localeCompare(tab_b.hostname);
        return (
            (asc ? 1 : -1) *
            (hostCmp !== 0 ? hostCmp : tab_a.url.localeCompare(tab_b.url))
        );
    }
};

/**
 * @typedef {TabGroupModel & {
 *   size: number,
 *   lastAccessed: number
 * }} SortableTabGroup
 */

/**
 * Tab group comparison functions
 * @param {SortableTabGroup} group_a
 * @param {SortableTabGroup} group_b
 * @param {boolean} asc sort direction, ascending if true or descending if false
 * @returns {Number} A negative number if `group_a` comes before `group_b`, 0 if they're the same value, and a positive number if `group_b` comes before `group_a`
 */
const TabGroupComparators = {
    compareAccessRecency(group_a, group_b, asc = true) {
        return (asc ? 1 : -1) * (group_a.lastAccessed - group_b.lastAccessed);
    },
    compareTitle(group_a, group_b, asc = true) {
        return (asc ? 1 : -1) * group_a.title.localeCompare(group_b.title);
    },
    compareSize(group_a, group_b, asc = true) {
        return (asc ? 1 : -1) * (group_a.size - group_b.size);
    }
};

/**
 * @param {tab.Tab} tab
 * @returns {string}
 */
function getTabHostname(tab) {
    try {
        const hostname = new URL(tab.url).hostname;
        if (hostname === "") {
            if (tab.url.startsWith("about:")) {
                return "about-firefox";
            } else if (tab.url.startsWith("chrome://")) {
                return "about-chrome";
            } else {
                return tab.url;
            }
        }
        return hostname;
    } catch {
        return tab.url;
    }
}

const TabArrangementComparators = {
    groups: {
        recency: TabGroupComparators.compareAccessRecency,
        title: TabGroupComparators.compareTitle,
        size: TabGroupComparators.compareSize
    },
    tabs: {
        recency: TabComparators.compareAccessRecency,
        title: TabComparators.compareTitle,
        url: TabComparators.compareURL
    }
};

/**
 * Sort a list of browser tab objects.
 * @param {browser.tabs.Tab[]} tabs a list of [`tab`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab) objects.
 * @param {Object} ungroupedTabSortOptions
 * @param {string} ungroupedTabSortOptions.sort_by which property to sort the tabs by. one of `['url', 'title', 'recency']`
 * @param {boolean} ungroupedTabSortOptions.ascending whether to sort ascending (`true`) or descending (`false`)
 * @returns {tabs.Tab[]} A list of tabs sorted by `sort_property`
 */
function sortBrowserTabs(
    tabs,
    ungroupedTabSortOptions = DEFAULT_OPTIONS_UNGROUPED_TABS
) {
    const comparator = TabArrangementComparators.tabs[ungroupedTabSortOptions.sort_by];
    if (!comparator) {
        throw new Error(`Unexpected 'sort_by': ${ungroupedTabSortOptions.sort_by}`);
    }
    const tabs_copy =
        ungroupedTabSortOptions.sort_by === "url"
            ? tabs.map((tab) => ({ ...tab, hostname: getTabHostname(tab) }))
            : [...tabs];
    return tabs_copy.sort((a, b) => comparator(a, b, ungroupedTabSortOptions.ascending));
}

/**
 * Sort a list of browser tab groups
 * @param {browser.tabGroups.TabGroup[]} groups a list of [`tabGroups`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups) objects
 * @param {Object} tabGroupSortOptions
 * @param {string} tabGroupSortOptions.sort_by which property to sort the groups by. one of `['recency', 'size', 'title']`
 * @param {boolean} tabGroupSortOptions.ascending whether to sort ascending (`true`) or descending (`false`)
 * @returns {Promise<SortableTabGroup[]>} A list of tab groups sorted by `sort_property`
 */
async function sortBrowserTabGroups(
    groups,
    tabGroupSortOptions = DEFAULT_OPTIONS_TAB_GROUPS
) {
    const comparator = TabArrangementComparators.groups[tabGroupSortOptions.sort_by];
    if (!comparator) {
        throw new Error(`Unexpected 'sort_by': ${tabGroupSortOptions.sort_by}`);
    }

    if (tabGroupSortOptions.sort_by === "title") {
        return [...groups].sort((a, b) => comparator(a, b, tabGroupSortOptions.ascending));
    }

    const groupsWithMetadata = await Promise.all(
        groups.map(async (group) => {
            const tabs = await chrome.tabs.query({ groupId: group.id });
            return {
                ...group,
                size: tabs.length,
                lastAccessed: Math.max(...tabs.map((t) => t.lastAccessed)),
            };
        })
    );

    return groupsWithMetadata.sort((a, b) => comparator(a, b, tabGroupSortOptions.ascending));
}

export {
    LOG,
    filterByTitleOrUrl,
    regexFromString,
    getTabGroups,
    queryTabs,
    queryTabGroups,
    moveTabs,
    moveTabGroups,
    SortByOptions,
    MoveToOptions,
    DEFAULT_OPTIONS_UNGROUPED_TABS,
    DEFAULT_OPTIONS_TAB_GROUPS,
    sortBrowserTabs,
    sortBrowserTabGroups
};
