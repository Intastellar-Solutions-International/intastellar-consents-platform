import "./Widget.css";
import "./Loading.css";
function Loading(props) {

    const style = (props?.style) ? props.style : {};

    if (props?.small) {
        return (
            <>
                <div className="key-highlight-widget small-widget loading-small-widget" style={style}>
                    <div className="smallIsLoading"></div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="widget" style={style}>
                <div className="bigNumIsLoading"></div>
                <div className="smallIsLoading"></div>
            </div>
        </>
    )
}

function CurrentPageLoading() {
    return (
        <>
            <div className="dashboard-content">
                <div className="bigNumIsLoading"></div>
                <div className="smallIsLoading"></div>
            </div>
        </>
    )
}

function LoadingBar() {
    return (
        <>
            <div className="loading-bar">
                <div className="loading-bar-progress">
                    <div className="loading-bar-progress-fill"></div>
                </div>
            </div>
        </>
    )
}

export { Loading, CurrentPageLoading, LoadingBar }