import "./Login.css";
import logo from "../Components/Header/logo.png";
import { LPFooter } from "../Components/Footer";
import API from "../API/api";
import Authentication from "../Authentication/Auth";
const Link = window.ReactRouterDOM.Link;
const useLocation = window.ReactRouterDOM.useLocation;
const useEffect = window.React.useEffect;

export default function Login() {
    document.title = "Intastellar Consents Solutions powered by Intastellar Solutions";
    const [email, setEmail] = React.useState();
    const [password, setPassword] = React.useState();
    const [isLoading, setLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState(null);
    const type = "";

    useEffect(() => {
        Intastellar.accounts.id.renderButton("login", {
            "picker": "button",
            "theme": "light"
        });

        // Create an graphic for the canvas, the graphic should be a simple animation
        // of consent management, with a simple animation of a user giving consent
        const canvas = document.getElementById("graphic");
        const ctx = canvas.getContext("2d");
        canvas.width = 200;
        canvas.height = window.innerHeight;
        let x = 0;
        let y = 0;
        let width = 100;
        let height = 100;

        let dx = 2;
        let dy = 2;
        let angle = 0;
        let radius = 50;
        let speed = 0.05;
        let color = "#fff";
        let alpha = 0.5;
        let scale = 1;
        let scaleSpeed = 0.01;
        let scaleDirection = 1;
        let scaleFactor = 1;
        let scaleFactorSpeed = 0.01;
        let scaleFactorDirection = 1;
        let scaleFactorMax = 1.5;
        let scaleFactorMin = 1;
        let scaleFactorMaxSpeed = 0.01;
        let scaleFactorMinSpeed = 0.01;
        let scaleFactorMaxDirection = 1;
        let scaleFactorMinDirection = -1;
        let scaleFactorMaxDirectionSpeed = 0.01;
        let scaleFactorMinDirectionSpeed = 0.01;
        let scaleFactorMaxDirectionMax = 1;
        let scaleFactorMinDirectionMax = -1;
        let scaleFactorMaxDirectionMin = 1;
        let scaleFactorMinDirectionMin = -1;

        function draw() {
            // User clicking on a consent button
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.scale(scale, scale);
            ctx.fillStyle = color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            ctx.restore();
            ctx.fillStyle = color;
            ctx.globalAlpha = alpha;
        }
        function update() {
            x += dx;
            y += dy;
            angle += speed;
            radius += scaleSpeed;
            if (radius > 100 || radius < 50) {
                scaleSpeed = -scaleSpeed;
            }
            if (x > canvas.width || x < 0) {
                dx = -dx;
            }
            if (y > canvas.height || y < 0) {
                dy = -dy;
            }
        }
        function animate() {
            requestAnimationFrame(animate);
            update();
            draw();
        }
        animate();
    }, []);

    return (
        <>
            <div className="loginForm-container">
                <div className="loginForm-header">
                    <section className="loginForm-header-content">
                        <img className="loginForm-logo" src={logo} alt="Intastellar Solutions Logo" />
                        <h1>Get started with <br /> Intastellar Consents Solutions</h1>
                        <p>By logging in, you can navigate to your consents managment tool, where you can find <strong>reports</strong> about & regarding your <strong>users consents</strong> on <strong>your Websites</strong>.</p>
                        <section>
                            <p>Our business tools can help you:</p>
                            <ul>
                                <li>Manage your users consents</li>
                                <li>Generate reports</li>
                                <li>Integrate with your websites</li>
                                <li>Get insights about your users</li>
                                <li>And much more...</li>
                            </ul>
                        </section>
                    </section>
                    <div className="graphic-container">
                        <canvas id="graphic" width="100%" height="100%"></canvas>
                    </div>
                </div>
                <div className="signin-container" style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh"
                }}>
                    <h2 className="loginForm-title">Log into Intastellar Consents Solutions</h2>
                    <div
                        id="login"
                        data-client_id="d2eefd7f1564fa4c9714000456183a6b0f51e8c9519e1089ec41ce905ffc0c453dfac91ae8645c41ebae9c59e7a6e5233b1339e41a15723a9ba6d934bbb3e92d"
                        data-app-name="Intastellar Consents Solutions"
                        data-login_uri={window.location.host + "/auth-login"}
                    ></div>
                    <Link to="/signup" className="loginForm-signup-2">
                        Create an account
                    </Link>
                    <img className="intastellar-accounts-logo" src="https://www.intastellarsolutions.com/assets/logos/intastellar-accounts.svg" />
                </div>
            </div>
            <section class="ppad key-numbers-section">
                <a href="https://www.cykelfaergen.info" target="_blank" rel="noopener"><img loading="lazy" class="used_by" src="https://www.cykelfaergen.info/assets/logo/logo.svg" alt="Cykelfærgen Flensborg fjord" /></a>
                <a href="https://teamjacobsen.dk" target="_blank" rel="noopener"><img loading="lazy" class="used_by" src="https://teamjacobsen.dk/img-own/TB_logo_white_91x50.jpg" alt="Team Jacobsen" /></a>
                <a href="https://laesoe-booking.dk" target="_blank" rel="noopener"><img loading="lazy" class="used_by" src="https://laesoe-booking.dk/media/2377/logo-combi.png" alt="Læsø Pakkerejser" /></a>
                <a href="https://www.parkinpeace.eu" target="_blank" rel="noopener"><img loading="lazy" class="used_by" src="https://www.parkinpeace.eu/assets/logo/Park-in-Peace-farve.svg" alt="ParkinPeace" /></a>
                <a href="https://asasoftware.aero" target="_blank" rel="noopener"><img class="used_by" src="https://asasoftware.aero/wp-content/uploads/2020/04/ASA.svg" alt="ASA Software ApS" /></a>
                <a href="https://www.laesoe-efterskole.dk" target="_blank" rel="noopener"><img class="used_by" src="https://www.laesoe-efterskole.dk/wp-content/uploads/2023/09/cropped-cropped-cropped-cropped-cropped-LaesoeEfterskole_Logo_Farve-1.png" alt="Læssø Efterskole" /></a>
            </section>
            <section className="grid-container grid-cols-2">
                <section className="main-content-section">
                    <h2 className="main-content-section-title">What is Intastellar Consent?</h2>
                    <p className="main-content-section-description">Intastellar Consent is a consent management platform that helps you manage your user consents in a compliant way.</p>
                    <a target="_blank" rel="noopener" href="https://www.intastellarsolutions.com" className="main-content-section-button">Learn More</a>
                </section>
                <section className="main-content-section">
                    <h2 className="main-content-section-title">Why Intastellar Consent?</h2>
                    <p className="main-content-section-description">Intastellar Consent is built on the Intastellar platform, which is a secure and scalable platform for building consent management solutions.</p>
                    <a target="_blank" rel="noopener" href="https://www.intastellarsolutions.com" className="main-content-section-button">Explore Features</a>
                </section>
            </section>
            <LPFooter />
        </>
    )
}