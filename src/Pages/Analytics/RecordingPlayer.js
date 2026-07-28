const { useEffect, useRef } = React;
import RRwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

// rrweb-player is a Svelte widget, not a React component — mounted/destroyed
// imperatively rather than rendered declaratively.
export default function RecordingPlayer({ events }) {
    const containerRef = useRef(null);
    const playerRef    = useRef(null);

    useEffect(() => {
        if (!containerRef.current || !events?.length) return;

        playerRef.current = new RRwebPlayer({
            target: containerRef.current,
            props: {
                events,
                width: containerRef.current.clientWidth || 900,
                height: 520,
                autoPlay: false,
                showController: true,
            },
        });

        return () => {
            try { playerRef.current?.$destroy?.(); } catch (e) {}
            playerRef.current = null;
        };
    }, [events]);

    if (!events?.length) {
        return <p className="sa-notice">No events in this recording.</p>;
    }

    return <div ref={containerRef} className="sa-recording-player" />;
}
