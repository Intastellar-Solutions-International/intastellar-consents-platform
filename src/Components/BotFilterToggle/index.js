import { useExcludeBots } from "../../Functions/botFilter.js";
import "./Style.css";

const RULES = "Hidden: traffic from datacenter IPs, a visitor accepting and rejecting within the same second, "
    + "and more than 5 decisions by one visitor per minute. Records are only flagged, never deleted.";

export default function BotFilterToggle() {
    const [excludeBots, setExcludeBots] = useExcludeBots();
    return (
        <label className="bot-filter-toggle" title={RULES}>
            <input
                type="checkbox"
                role="switch"
                checked={excludeBots}
                onChange={(e) => setExcludeBots(e.target.checked)}
            />
            <span className="bot-filter-toggle__track" aria-hidden="true" />
            <span className="bot-filter-toggle__label">Exclude suspected bots</span>
            <span className="bot-filter-toggle__hint">{excludeBots ? "on" : "off — all traffic shown"}</span>
        </label>
    );
}
