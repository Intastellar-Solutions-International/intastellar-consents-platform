import Textfield from '../InputFields/textInput';
import Button from '../Button/Button';
import './AddDomain.css';
import DomainList from '../DomainList/DomainList';
import { clearTextfield, extractHostname } from '../../Utils/Utils';

const { useState, useEffect, useRef, createContext } = React;
export default function AddDomain() {
    const [currentDomain, setCurrentDomain] = useState([]);
    const [disabled, setDisabled] = useState(true);
    const domainRegex = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi);
    return (
        <>
            <div className="dashboard-content">
                <h2>Add domain</h2>
                <p>Here you can add a domain to your organisation, for any website your Organisation is using the Intastellar Cookie Consents | CMP</p>
                <p>After adding a domain you can implement the Intastellar Cookie Consents on your website.</p>
                <div className='grid'>
                    <section>
                        <Textfield placeholder="Add your root domain" type={"url"} onChange={
                            (e) => {
                                if (e.target.value.length > 0 && e.target.value.match(domainRegex)) {
                                    setDisabled(false);
                                } else {
                                    setDisabled(true);
                                }
                            }
                        } />
                        <Button disabled={disabled} onClick={(e) => {
                            e.preventDefault();
                            if (!disabled) {
                                const domain = extractHostname(e.target.previousSibling.value)
                                setCurrentDomain([...currentDomain, domain]);
                                clearTextfield(e.target.previousSibling);
                                setDisabled(true);
                            }
                        }} text="Add domain to list" />
                    </section>
                    <DomainList domains={currentDomain} setCurrentDomain={setCurrentDomain} />
                </div>
            </div>
        </>
    )
}