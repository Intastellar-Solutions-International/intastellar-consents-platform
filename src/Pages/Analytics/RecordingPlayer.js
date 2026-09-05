const { useEffect, useRef, useMemo } = React;
import RRwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

// rrweb event type constants
const FULL_SNAPSHOT = 2;

// rrweb-player is a Svelte widget, not a React component — mounted/destroyed
// imperatively rather than rendered declaratively.
export default function RecordingPlayer({ events }) {
    const containerRef = useRef(null);
    const playerRef    = useRef(null);

    // Sort by timestamp so the FullSnapshot always leads, even if concurrent
    // chunk flushes were committed out of order before the server's seq-based
    // sort had a chance to fix them. FullSnapshot events (type 2) are also
    // hoisted to the front of ties so the replayer always has a DOM to start from.
    const sortedEvents = useMemo(() => {
        if (!events?.length) return [];
        return [...events].sort((a, b) => {
            const dt = a.timestamp - b.timestamp;
            if (dt !== 0) return dt;
            // Break timestamp ties: FullSnapshot first
            if (a.type === FULL_SNAPSHOT && b.type !== FULL_SNAPSHOT) return -1;
            if (b.type === FULL_SNAPSHOT && a.type !== FULL_SNAPSHOT) return  1;
            return 0;
        });
    }, [events]);

    const hasSnapshot = sortedEvents.some(e => e.type === FULL_SNAPSHOT);

    useEffect(() => {
        if (!containerRef.current || !sortedEvents.length || !hasSnapshot) return;

        const width = containerRef.current.clientWidth || 900;

        playerRef.current = new RRwebPlayer({
            target: containerRef.current,
            props: {
                events:         sortedEvents,
                width,
                height:         Math.round(width * (9 / 16)),
                autoPlay:       false,
                showController: true,
                skipInactive:   true,
            },
        });

        return () => {
            try { playerRef.current?.$destroy?.(); } catch (e) {}
            playerRef.current = null;
        };
    }, [sortedEvents, hasSnapshot]);

    if (!events?.length) {
        return <p className="sa-notice">No events in this recording.</p>;
    }

    if (!hasSnapshot) {
        return (
            <p className="sa-notice sa-notice--error">
                This recording is missing its initial page snapshot — it was likely
                interrupted before the first chunk could be saved.
            </p>
        );
    }

    return <div ref={containerRef} className="sa-recording-player" />;
}
