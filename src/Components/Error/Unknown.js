export default function Unknown(props) {
    return (
        <div className="error">
            <div className="error-container">
                <div className="error-header">
                    <h1>404</h1>
                    <h2>Page not found</h2>
                </div>
                <div className="error-body">
                    <p>Sorry, we couldn't find the page you were looking for.</p>
                    <p>Try going back to the previous page or go to our <a href="/">homepage</a>.</p>
                </div>
            </div>
        </div>
    )
}