import { PrimaryHost, LoginHost } from "./host";
import Authentication from "../Authentication/Auth";

const API = {
    Login: {
        url: `${LoginHost}/signin/v2/signin`,
    },
    OrganisationData: {
        url: `https://apis.intastellarsolutions.com/getOrganisation.php`,
    },
    SignUp: {
        url: `${LoginHost}/consents/signup/v1/signup`,
    },
    Subscription: {
        url: `${PrimaryHost}/payment/subscription/v1/subscription`,
        method: "POST",
        headers: {
            "Authorization": Authentication.getToken(),
            "Content-Type": "application/json"
        }
    },
    liveData: {
        url: `//apis.intastellarsolutions.com/analytics/gdpr/livedata`,
        method: "GET",
        headers: {
            "Authorization": Authentication.getToken(),
            "Organisation": Authentication.getOrganisation(),
            "Content-Type": "application/json"
        }
    },
    experiments: {
        getExperiments: {
            url: `${PrimaryHost}/analytics/gdpr/experiements`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        }
    },
    gdpr: {
        getTotalNumber: {
            url: `${PrimaryHost}/analytics/gdpr/getTotalNumber`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getStyle: {
            url: `${PrimaryHost}/analytics/gdpr/getBannerStyle`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getDomainsUrl: {
            url: `${PrimaryHost}/analytics/gdpr/getDomainStatistics`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json",
                "SortOrder": "desc",
            }
        },
        getInteractions: {
            url: `${PrimaryHost}/analytics/gdpr/getInteractions`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getInteractionsByCountry: {
            url: `${PrimaryHost}/analytics/gdpr/interactionsByCountry`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        /** Referrer + UTM / marketing query parameters (implement on backend). */
        marketingAttribution: {
            url: `${PrimaryHost}/analytics/gdpr/marketingAttribution`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        complianceSnapshot: {
            url: `${PrimaryHost}/cmp/compliance-snapshot.php`,
            method: "GET",
            headers: {
                Authorization: Authentication.getToken(),
                Organisation: Authentication.getOrganisation(),
                "Content-Type": "application/json",
            },
        },
        getDomains: {
            url: `${PrimaryHost}/analytics/gdpr/getDomains`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        compareDomains: {
            url: `${PrimaryHost}/analytics/gdpr/compare`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            },
            body: (domains) => JSON.stringify({ Domains: domains })
        },
        saveBlacklistIp: {
            url: `${PrimaryHost}/analytics/gdpr/black-lists-ip`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            },
            body: (ipAddress) => JSON.stringify({ ipAddress: ipAddress })
        },
        getBlackList: {
            url: `${PrimaryHost}/analytics/gdpr/getBlackList`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getLanguage: {
            url: `${PrimaryHost}/analytics/gdpr/getLanguage`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        generatePDF: {
            url: `${PrimaryHost}/analytics/gdpr/generatePDF`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json",
            }
        },
        exportPDF: {
            url: `${PrimaryHost}/analytics/gdpr/generatePDF`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json",
                "Organisation": Authentication.getOrganisation(),
            }
        },
        getDevices: {
            url: `${PrimaryHost}/analytics/gdpr/getDevices`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getCookies: {
            url: `${PrimaryHost}/analytics/gdpr/cookiesAPI`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        audit: {
            url: `${PrimaryHost}/cmp/audit-report.php`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        observedCookies: {
            url: `${PrimaryHost}/cmp/observed-cookies`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
    },
    ferry: {
        getTotalSales: {
            url: `${PrimaryHost}/analytics/ferry/getTotalSales`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        }
    },
    settings: {
        createUser: {
            url: `${LoginHost}/consents/signup/v1/create-user`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            },
            body: (firstName, lastName, email, password, role, organisation) => JSON.stringify({
                firstName: firstName,
                lastName: lastName,
                email: email,
                password: password,
                role: role,
                organisation: organisation
            })
        },
        getAllOrganisations: {
            url: `${PrimaryHost}/cmp/get-organisation`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        getOrganisation: {
            url: `${PrimaryHost}/analytics/settings/getOrganisation`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        createOrganisation: {
            url: `${PrimaryHost}/analytics/settings/create-organisation`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        updateOrganisation: {
            url: `${PrimaryHost}/analytics/settings/update-organisation`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        deleteOrganisation: {
            url: `${PrimaryHost}/analytics/settings/delete-organisation`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        updateSettings: {
            url: `${PrimaryHost}/analytics/settings/updateSettings`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        addUser: {
            url: `${PrimaryHost}/analytics/settings/add-user`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        getOrgUsers: {
            url: `${PrimaryHost}/analytics/settings/getOrgUsers`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        updateOrgUser: {
            url: `${PrimaryHost}/analytics/settings/update-org-user`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        deleteOrgUser: {
            url: `${PrimaryHost}/analytics/settings/delete-org-user`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        getSettings: {
            url: `${PrimaryHost}/analytics/settings/getOrganisation`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        createSettings: {
            url: `${PrimaryHost}/analytics/settings/create-organisation`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        },
        addDomain: {
            url: `${PrimaryHost}/analytics/settings/add-domain`,
            method: "POST",
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        },
        user: {
            headers: {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            },
            update: {
                url: `${PrimaryHost}/analytics/settings/user`,
                method: "POST"
            },
            get: {
                url: `${PrimaryHost}/analytics/settings/getUserSettings`,
                method: "POST"
            },
        }
    },
    ferry: {
        getTotalSales: {
            url: `${PrimaryHost}/analytics/ferry/getTotalSales`,
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": Authentication.getOrganisation(),
                "Content-Type": "application/json"
            }
        }
    },
    github: {
        createIssue: {
            url: "https://api.github.com/repositories/Intastellar-Solutions-International/intastellar-analytics/issues",
            method: "POST",
            headers: {
                "Authorization": "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",
                'X-GitHub-Api-Version': '2022-11-28',
            }
        }
    }
};

export default API;