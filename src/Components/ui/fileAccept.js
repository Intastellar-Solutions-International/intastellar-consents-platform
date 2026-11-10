/** Whether a file matches an input-style accept list (".svg", "image/png", "image/*"). Some systems report no type, so extensions count. */
export function acceptsFile(file, accept) {
    if (!accept) return true;
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    return accept.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean).some((rule) => {
        if (rule.startsWith(".")) return name.endsWith(rule);
        if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
        return type === rule;
    });
}

export function formatFileLimit(bytes) {
    return bytes >= 1048576 ? `${Math.round(bytes / 1048576)} MB` : `${Math.round(bytes / 1024)} KB`;
}
