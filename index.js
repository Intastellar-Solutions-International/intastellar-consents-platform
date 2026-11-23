import App from "./src/App.js";
import AppHandoff from "./src/Pages/AppHandoff/index.js";
const createRoot = window.ReactDOM.createRoot
const container = document.getElementById('app');
const root = createRoot(container); // createRoot(container!) if you use TypeScript
// The mobile app's hand-over page runs before <App />, so App's sign-in gate
// doesn't redirect it to /login while the session is being stored.
root.render(window.location.pathname === "/app-handoff" ? <AppHandoff /> : <App />);
