const useLocation = window.ReactRouterDOM.useLocation;
const { useState, useEffect, useRef, useContext } = React;
import API from "../API/api";
export default function AuthLogin() {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const rawToken = query.get("token");
    const token = rawToken ? decodeURIComponent(rawToken) : null;

    if (!token) {
        window.location.href = "/login";
        return null;
    }

    console.log("Token from URL: ", typeof token, token);
    // Convert token string to object if needed

    const parsedToken = token ? JSON.parse(token) : null;
    console.log("Parsed Token: ", typeof parsedToken, parsedToken);

    fetch(API.Login.url, {
        withCredentials: false,
        method: "POST",
        headers: {
            'LoginType': 'oauth',
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
            email: parsedToken?.user?.email,
            account_domain: parsedToken?.account_domain,
        })
    }).then((response) => {
        return response.json();
    }).then(response => {
        if (response === "Err_Logon_Fail") {
            console.error("Error logging in");
            return;
        }

        localStorage.setItem("organisation", response.organisation);
        localStorage.setItem("globals", JSON.stringify(response));

        if (localStorage.getItem("platform") === null || localStorage.getItem("platform") === undefined) {
            window.location.href = "/dashboard";
        } else {
            window.location.href = "/" + localStorage.getItem("platform") + "/dashboard";
        }
    })

    //{"token":"eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NDQyNzA1MDUsIm5iZiI6MTc0NDI2NjkwNSwiaXNzIjoiSW50YXN0ZWxsYXIgU29sdXRpb25zLCBJbnRlcm5hdGlvbmFsIiwiUEFZTE9BRCI6ImZlbGl4LnNjaHVsdHpAaW50YXN0ZWxsYXIuY29tIn0.OTF0SGMwTERtQ0x3MDM2YWlOYmNNX29aRDVIc2dNcERwRG1xeUlZMVVBNkhWTWhtZlJxeFh6UG5CMUJrNXRBaGlpWmVac0cyNEN6eGFjaEVOQ0oxaXc","status":"super-admin","access":{"type":{"":{"type":null,"uri":null}},"user_access":[null]},"organisation":"{\"id\":\"1\",\"name\":\"Intastellar Solutions, International\"}","profile":{"name":{"first_name":"Felix A.","last_name":"Schultz"},"email":"felix.schultz@intastellar.com","image":"https://scontent-uc-d2c-7.intastellaraccounts.com/a/s/ul/p/avtr46-img/felix.schultz@intastellar.com/profile/shg64x73usd8gai3a0p1b3tz59jgcjvzjgxvl6w5zo7cpp0l49qw51d5pjb4cgx7e8n8xlkntns3enoxxbmjb3510qcydnnrhwmxhtebnplhntdqu0r4j5yiyiacms82t83rlgh5wjjdean1wcv53dq2d0evvhfzkc3856qoyv5pbg1l3j3tejfnntxpq5kyk3pruanl.jpg"}}


    // You can now use the token in your application logic
    // For example, you might want to store it in local storage or use it to authenticate a user

    return null;
}