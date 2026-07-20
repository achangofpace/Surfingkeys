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
 * Sort predicate functions for tabs
 *
 * @param {Object} tab_a
 * @param {Object} tab_b
 * @param {boolean} asc sort direction - ascending or descending
 * @returns {Number} A negative number if `tab_a` comes before `tab_b`, 0 if they're the same value, and a positive number if `tab_b` comes before `tab_a`
 */
const TabComparison = {
    compareAccessRecency(tab_a, tab_b, asc = true) {
        const direction = asc ? 1 : -1;
        return direction * (tab_a.lastAccessed - tab_b.lastAccessed);
    },
    compareTitle(tab_a, tab_b, asc = true) {
        const direction = asc ? 1 : -1;
        return direction * tab_a.title.localeCompare(tab_b.title);
    },
    compareURL(tab_a, tab_b, asc = true) {
        const direction = asc ? 1 : -1;
        const hostCmp = tab_a.hostname.localeCompare(tab_b.hostname);
        return direction * hostCmp;
    },
};

function getTabHostname(tab) {
    try {
        return new URL(tab.url).hostname;
    } catch {
        return tab.url;
    }
}

const SortHandlers = {
    recency: TabComparison.compareAccessRecency,
    title: TabComparison.compareTitle,
    url: TabComparison.compareURL,
};

/**
 * Sort a list of browser tab objects.
 * @param {tabs.Tab[]} tabs a list of [Tab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab) objects.
 * @param {string} sort_by which property to sort the tabs by. one of `['url', 'title', 'recency']`
 * @param {boolean} ascending whether to sort ascending (`true`) or descending (`false`)
 * @returns {Object[]} A list of tabs sorted by `sort_property`
 */
function sortBrowserTabs(tabs, sort_by = "url", ascending = true) {
    const handler = SortHandlers[sort_by];
    if (!handler) {
        throw Error(`Unexpected 'sort_by': ${sort_by}`);
    }
    const tabs_copy =
        sort_by === "url"
            ? tabs.map((tab) => ({ ...tab, hostname: getTabHostname(tab) }))
            : [...tabs];
    return tabs_copy.sort((a, b) => handler(a, b, ascending));
}

export {
    LOG,
    filterByTitleOrUrl,
    regexFromString,
    sortBrowserTabs
}
