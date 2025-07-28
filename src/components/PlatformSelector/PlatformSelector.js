import Select from "../SelectInput/Selector"
import "./PlatformSelector.css";
import logo from "../Header/logo.png";
import { OrganisationContext } from "../../App";
const { useState, useEffect, useContext } = React;
export default function PlatformSelector(props) {

    const items = Object.keys(props?.platforms).map((platform) => {
        return props?.platforms[platform];
    }).filter((company) => {
        return company.name === localStorage.getItem("organisation").name
    })?.map((platform) => {
        return {
            type: platform.access.type,
            uri: platform.access.uri
        }
    }).map((platform) => {
        const type = platform?.type?.split(",")?.map((type) => {
            return type.trim();
        })
        const uri = platform?.uri?.split(",")?.map((uri) => {
            return uri.trim();
        })
        return type?.map((type, key) => {
            return {
                type: type,
                uri: uri[key]
            }
        })
    }).reduce((acc, val) => acc.concat(val), [])?.map((item) => {
        return item;
    });

    return <>
        <div className="platform grid">
            <img className="platform-select-logo" src={logo} alt="Intastellar Solutions Logo" />
            <h1>Please Select a Platform that you want to view data for:</h1>
            {
                (items.length === 1 && items.indexOf(undefined) > -1) ? (
                    <>
                        <p>You don´t have access to any platforms yet, please contact your administrator.</p>
                        <Select defaultValue={"Choose another Organisation"} key={""} items={props?.platforms} onChange={
                            (e) => {
                                localStorage.setItem("organisation", JSON.parse(e));
                                window.location.reload();
                            }
                        } />
                    </>
                ) : <Select style={{ left: "0", fontSize: "16px" }} key={""} items={items} defaultValue={"Choose a platform"} onChange={(e) => {
                    props.setId(JSON.parse(e).uri);
                    localStorage.setItem("platform", JSON.parse(e).uri);
                    window.location.href = `/${JSON.parse(e).uri}/dashboard`;
                }} />
            }
        </div>
    </>
}