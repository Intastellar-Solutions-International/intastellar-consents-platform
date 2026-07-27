export default class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      
      this.state = { hasError: false };
    }
  
  static getDerivedStateFromError(error) {
      // Update state so the next render will show the fallback UI.
      return { hasError: true};
    }
  
    render() {
      if (this.state.hasError) {
        // You can render any custom fallback UI

        return <>
          <div className="ppad">
            <h1>Something went wrong.</h1>
            <p>Sorry for the inconvenient, but we are hav'ing currently some technical errors.</p>
          </div>
        </>;
      }
  
      return this.props.children; 
    }
}