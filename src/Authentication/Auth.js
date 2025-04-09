const Authentication = {
    oAuthCallback: function (e) {
        const url = window.location.href;
        console.log(e);
    },
    Login: function (url, email, password, type, setErrorMessage, setLoading) {
        setLoading(true);
        fetch(url, {
            withCredentials: false,
            method: "POST",
            headers: {
                'LoginType': 'employee',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                type: type
            })
        }).then((response) => {
            return response.json();
        }).then(response => {
            if (response === "Err_Logon_Fail") {
                setErrorMessage("We having trouble to log you in");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Fail_Wrong_Password_Or_Email") {
                setErrorMessage("Wrong password or email");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Deny") {
                setErrorMessage("Your account has been locked due to too many incorrect password attempts – please contact your Intastellar Account Manager for assistance");
                setLoading(false);
                return;
            }

            setLoading(false);

            localStorage.setItem("organisation", response.organisation);
            localStorage.setItem("globals", JSON.stringify(response));

            if (localStorage.getItem("platform") === null || localStorage.getItem("platform") === undefined) {
                window.location.href = "/dashboard";
            } else {
                window.location.href = "/" + localStorage.getItem("platform") + "/dashboard";
            }

        })
    },
    Logout: function () {
        localStorage.removeItem("globals");
        localStorage.removeItem("organisation");
        localStorage.removeItem("domains");
        window.location.href = "/";
    },
    getToken: function () {
        const token = (JSON.parse(localStorage.getItem("globals"))?.token) ? "Bearer " + JSON.parse(localStorage.getItem("globals"))?.token : undefined;
        return token;
    },
    getUserId: function () {
        const email = (JSON.parse(localStorage.getItem("globals"))?.profile?.email) ? JSON.parse(localStorage.getItem("globals"))?.profile?.email : undefined;
        return email;
    },
    getOrganisation: function () {
        const organisation = (localStorage.getItem("organisation") != null || localStorage.getItem("organisation") != undefined) ? JSON.parse(localStorage.getItem("organisation"))?.id : undefined;
        return organisation;
    },
    SignUp: function (url, email, password, firstname, lastname, type, companyName, setErrorMessage, setLoading) {
        setLoading(true);
        fetch(url, {
            withCredentials: false,
            method: "POST",
            headers: {
                'LoginType': 'employee',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                type: type,
                firstname: firstname,
                lastname: lastname,
                companyName: companyName
            })
        }).then((response) => {
            return response.json();
        }).then(response => {
            if (response === "Err_Logon_Fail") {
                setErrorMessage("We having trouble to log you in");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Fail_Wrong_Password_Or_Email") {
                setErrorMessage("Wrong password or email");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Deny") {
                setErrorMessage("Your account has been locked due to too many incorrect password attempts – please contact your Intastellar Account Manager for assistance");
                setLoading(false);
                return;
            }

            setLoading(false);

            if (response == "Success") {
                window.location.href = "/login";
            }

        })
    },
    User: {
        Status: JSON.parse(localStorage.getItem("globals"))?.status
    }
}

export default Authentication;