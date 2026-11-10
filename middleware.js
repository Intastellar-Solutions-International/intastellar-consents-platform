import { customHostTarget } from "./api/_known-hosts.js";

// Runs before static files, so a customer's domain can't load the dashboard's index.html.
export const config = { matcher: ["/((?!api/|privacy-request/|.*\\.[a-zA-Z0-9]+$).*)"] };

const carryOn = () => new Response(null, { headers: { "x-middleware-next": "1" } });

export default function middleware(request) {
    try {
        const url = new URL(request.url);
        const target = customHostTarget(request.headers.get("host") || url.hostname, url.search);
        if (!target) return carryOn();
        return new Response(null, { headers: { "x-middleware-rewrite": new URL(target, request.url).toString() } });
    } catch {
        return carryOn();
    }
}
