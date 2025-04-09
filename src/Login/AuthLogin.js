const useLocation = window.ReactRouterDOM.useLocation;
function AuthLogin() {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const token = query.get("token");

    console.log("Token from URL: ", token);
    // You can now use the token in your application logic
    // For example, you might want to store it in local storage or use it to authenticate a user

    return <>
        <div className="loginForm-container">
            <form className="loginForm" onSubmit={(e) => { e.preventDefault() }}>
                <h1 className="loginForm-title">Sign in to Intastellar Consents</h1>
                <label>Login successful, you can close this window</label>
            </form>
        </div>
    </>;
}