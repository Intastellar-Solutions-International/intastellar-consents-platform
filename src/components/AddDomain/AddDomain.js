import Textfield from "../InputFields/textInput";
import Button from "../Button/Button";
import "./AddDomain.css";
import DomainList from "../DomainList/DomainList";
import { clearTextfield, extractHostname } from "../../Utils/Utils";

const { useState } = React;

export default function AddDomain({ embedded }) {
    const [currentDomain, setCurrentDomain] = useState([]);
    const [disabled, setDisabled] = useState(true);
    const domainRegex =
        /[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)?/gi;

    const body = (
        <>
            {!embedded ? (
                <>
                    <h2>Add domain</h2>
                    <p>
                        Add a domain to your organisation to track Intastellar Consents usage on your
                        website.
                    </p>
                </>
            ) : (
                <p className="settings-subpage__intro" style={{ marginTop: 0 }}>
                    Add a root domain to your organisation. We validate the hostname before you can add it
                    to the list.
                </p>
            )}
            <div className="grid">
                <section>
                    <Textfield
                        placeholder="Add your root domain"
                        type="url"
                        onChange={(e) => {
                            if (e.target.value.length > 0 && e.target.value.match(domainRegex)) {
                                setDisabled(false);
                            } else {
                                setDisabled(true);
                            }
                        }}
                    />
                    <Button
                        disabled={disabled}
                        onClick={(e) => {
                            e.preventDefault();
                            if (!disabled) {
                                const domain = extractHostname(e.target.previousSibling.value);
                                setCurrentDomain([...currentDomain, domain]);
                                clearTextfield(e.target.previousSibling);
                                setDisabled(true);
                            }
                        }}
                        text="Add domain to list"
                    />
                </section>
                <DomainList domains={currentDomain} setCurrentDomain={setCurrentDomain} />
            </div>
        </>
    );

    if (embedded) {
        return <div className="settings-subpage__panel">{body}</div>;
    }

    return (
        <div className="dashboard-content" style={{ padding: "20px", maxWidth: "1200px" }}>
            {body}
        </div>
    );
}
