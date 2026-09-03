export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="sa-boundary-error">
                    <span className="sa-boundary-error__icon">!</span>
                    <span>This section failed to load — try refreshing the page.</span>
                </div>
            );
        }
        return this.props.children;
    }
}
