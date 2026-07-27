const FAVOURITES_KEY = "favourite_domains";
const RECENT_KEY = "recent_domains";
const RECENT_LIMIT = 8;

export function getFavouriteDomains() {
    try {
        const parsed = JSON.parse(localStorage.getItem(FAVOURITES_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function isFavouriteDomain(name) {
    return getFavouriteDomains().includes(name);
}

export function toggleFavouriteDomain(name) {
    const current = getFavouriteDomains();
    const next = current.includes(name)
        ? current.filter((d) => d !== name)
        : [...current, name];
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
    return next;
}

export function getRecentDomains() {
    try {
        const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function pushRecentDomain(name) {
    if (!name || name === "combined view") return;
    const next = [name, ...getRecentDomains().filter((d) => d !== name)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
}
