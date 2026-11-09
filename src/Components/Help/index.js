import Drawer from "../ui/Drawer.js";
import { Icon } from "../ui/icons.js";

const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;

export const OPEN_HELP_EVENT = "help:open";

const HELP_DESK_URL = "https://help.intastellar.eu/";
const FOOTER_LINK = "tw-text-sm tw-text-accent-strong tw-rounded-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus";

/** Help button for the header, and the panel that shows the help desk in page. */
export default function HelpCenter() {
    const [open, setOpen] = useState(false);
    const platform = localStorage.getItem("platform") || "gdpr";

    useEffect(() => {
        const show = () => setOpen(true);
        window.addEventListener(OPEN_HELP_EVENT, show);
        return () => window.removeEventListener(OPEN_HELP_EVENT, show);
    }, []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Help"
                title="Help"
                className="help-trigger tw-flex tw-items-center tw-justify-center tw-h-10 tw-w-10 tw-border-0 tw-bg-transparent tw-rounded-md tw-text-text-secondary tw-cursor-pointer hover:tw-bg-white/5 hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
            >
                <Icon name="help-circle" size={20} />
            </button>
            <Drawer
                open={open}
                onClose={() => setOpen(false)}
                title="Help"
                width="lg"
                flush
                footer={(
                    <div className="tw-flex tw-flex-wrap tw-justify-between tw-gap-4 tw-w-full">
                        <Link to={`/${platform}/onboarding`} onClick={() => setOpen(false)} className={FOOTER_LINK}>Getting started</Link>
                        <a href={HELP_DESK_URL} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>Open in a new tab</a>
                    </div>
                )}
            >
                <iframe title="Help desk" src={HELP_DESK_URL} className="tw-block tw-w-full tw-h-full tw-border-0 tw-bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
            </Drawer>
        </>
    );
}
