import { PROCESSING_PURPOSES, LEGAL_BASES } from "../../../Functions/legalBasisDefinitions.js";

/* The bases a service can run on before consent; the same list as SERVICE_BASES in api/_legal-basis.js. */
const SERVICE_BASES = LEGAL_BASES.GDPR.filter((b) => b.id !== "consent");

const blankService = () => ({ name: "", hosts: "", purpose: "functional", basis: "legitimate_interest", deviceAccess: false });

/*
 * Services the site runs without consent, e.g. a HubSpot form under legitimate interest.
 * Saved with the rest of the page; the banner gets them through the domain's config.js.
 */
export default function ServicesEditor({ services, onChange }) {
    const update = (index, patch) => onChange(services.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    const remove = (index) => onChange(services.filter((_, i) => i !== index));

    return (
        <section className="settings-subpage__panel legal-services">
            <h2 className="legal-services__title">Services without consent</h2>
            <p className="legal-services__intro">
                Scripts the banner lets run before the visitor decides, because they rest on another legal basis.
                Visitors can object to legitimate interest services in the banner's settings. A service that
                stores or reads anything on the device (cookies, local storage, fingerprinting) needs consent
                in the EU whatever its legal basis, so the banner keeps blocking it.
            </p>

            {services.length === 0 && <p className="settings-subpage__empty">No services yet. Everything waits for consent.</p>}

            {services.map((s, index) => {
                const id = `legal-service-${index}`;
                return (
                    <fieldset key={index} className="legal-services__item">
                        <legend className="legal-services__legend">{s.name || "New service"}</legend>
                        <div className="legal-services__grid">
                            <label className="legal-services__field" htmlFor={`${id}-name`}>
                                <span>Name</span>
                                <input id={`${id}-name`} className="settings-subpage__select" value={s.name}
                                    placeholder="HubSpot Forms" onChange={(e) => update(index, { name: e.target.value })} />
                            </label>
                            <label className="legal-services__field legal-services__field--wide" htmlFor={`${id}-hosts`}>
                                <span>Script hostnames</span>
                                <input id={`${id}-hosts`} className="settings-subpage__select" value={s.hosts}
                                    placeholder="js.hsforms.net, forms.hsforms.com" onChange={(e) => update(index, { hosts: e.target.value })} />
                            </label>
                            <label className="legal-services__field" htmlFor={`${id}-purpose`}>
                                <span>Purpose</span>
                                <select id={`${id}-purpose`} className="settings-subpage__select" value={s.purpose}
                                    onChange={(e) => update(index, { purpose: e.target.value })}>
                                    {PROCESSING_PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                            </label>
                            <label className="legal-services__field" htmlFor={`${id}-basis`}>
                                <span>Legal basis</span>
                                <select id={`${id}-basis`} className="settings-subpage__select" value={s.basis}
                                    onChange={(e) => update(index, { basis: e.target.value })}>
                                    {SERVICE_BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                                </select>
                            </label>
                        </div>
                        <label className="legal-services__check">
                            <input type="checkbox" checked={Boolean(s.deviceAccess)}
                                onChange={(e) => update(index, { deviceAccess: e.target.checked })} />
                            Stores or reads data on the visitor's device
                        </label>
                        {s.deviceAccess && (
                            <p className="settings-subpage__status settings-subpage__status--error legal-services__warning">
                                The banner will keep blocking this service until the visitor consents. Storing or
                                reading on the device needs consent under ePrivacy Art. 5(3), whatever the legal basis.
                            </p>
                        )}
                        <button type="button" className="legal-services__remove" onClick={() => remove(index)}>
                            Remove
                        </button>
                    </fieldset>
                );
            })}

            <button type="button" className="legal-services__add" onClick={() => onChange([...services, blankService()])}>
                Add service
            </button>
        </section>
    );
}
