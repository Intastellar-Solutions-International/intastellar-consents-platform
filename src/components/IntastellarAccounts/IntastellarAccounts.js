import Authentication from "../../Authentication/Auth";
import "./Style.css";
const { useState, useEffect } = window.React;

export default function Account(props) {
    const [demoMode, isDemoMode] = useState(Authentication.DemoMode);

    useEffect(() => {
        const unsubscribe = Authentication.onDemoModeChange(isDemoMode);
        return unsubscribe;
    }, []);

    return (
        <div className="ia-menu user_content">
            <div className="ia-menu__accent" aria-hidden="true" />
            <div className="ia-menu__body">
                <div className="ia-menu__brand">
                    <img
                        src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg"
                        alt=""
                        className="ia-menu__brand-logo"
                    />
                </div>

                <div className="ia-menu__avatar-wrap">
                    <img src={props.profile.image} alt="" className="ia-menu__avatar" />
                </div>

                <div className="ia-menu__identity">
                    <p className="ia-menu__greeting">Hi, {props.profile.name}!</p>
                    <p className="ia-menu__email">{props.profile.email}</p>
                    <a
                        href="https://my.intastellaraccounts.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ia-menu__manage"
                    >
                        <img
                            src="https://www.intastellarsolutions.com/assets/icons/fav/favicon-96x96.png"
                            alt=""
                            className="ia-menu__manage-icon"
                            width={32}
                            height={32}
                        />
                        <span>Manage your Intastellar account</span>
                    </a>
                </div>

                {Authentication.getOrganisation() == 1 ? (
                    <>
                        <div className="ia-menu__separator" />
                        <div className="ia-menu__demo" role="group" aria-labelledby="ia-workspace-section">
                            <p className="ia-menu__workspace-title" id="ia-workspace-section">
                                Workspace
                            </p>
                            <div className="ia-menu__demo-row">
                                <span className="ia-menu__demo-label" id="ia-demo-label">
                                    Demo mode
                                </span>
                                <label className="ia-menu__switch">
                                    <input
                                        type="checkbox"
                                        checked={demoMode}
                                        onChange={(e) => Authentication.SetDemoMode(e.target.checked)}
                                        aria-labelledby="ia-workspace-section ia-demo-label"
                                    />
                                    <span className="ia-menu__switch-slider" />
                                </label>
                            </div>
                            <p className="ia-menu__demo-hint">Masks live data across dashboards.</p>
                        </div>
                    </>
                ) : null}
            </div>

            <div className="ia-menu__footer">
                <button type="button" className="ia-menu__sign-out" onClick={() => Authentication.Logout()}>
                    <svg className="ia-menu__sign-out-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path
                            fill="currentColor"
                            d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
                        />
                    </svg>
                    Sign out
                </button>
            </div>
        </div>
    );
}
