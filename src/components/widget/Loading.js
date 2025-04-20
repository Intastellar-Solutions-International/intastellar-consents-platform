import "./Widget.css";
import "./Loading.css";
function Loading() {
    return (
        <>
            <div className="widget">
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