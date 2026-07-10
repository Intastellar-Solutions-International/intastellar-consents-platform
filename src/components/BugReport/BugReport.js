const { useState, useEffect, useRef, useContext } = React;
import "./BugReport.css";
import API from "../../API/api";
import appStorage from '../../Functions/storage.js';
export default function BugReport() {
    const [isOpen, setIsOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    function openMenu() {
        setIsOpen(!isOpen);
    }

    function clickOutSide(e) {
        if (e.target.className !== "send-feedback" && e.target.className !== "bugReport-input" && e.target.className !== "bugReport-input bugReport-input --height" && e.target.className !== "bugReport-send") {
            setIsOpen(false);
        }
    }

    function sendFeedback(e) {
        e.preventDefault();
        /* setIsOpen(false); */

        fetch(API.github.createIssue.url, {
            method: API.github.createIssue.method,
            body: JSON.stringify({
                owner: "IntastellarSolutions",
                repo: "IntastellarAnalytics",
                title: document.querySelector(".feedback-type").value + ": " + document.querySelector(".--feedbackTitle").value,
                body: document.querySelector(".--feedbackMessage").value,
                labels: [
                    document.querySelector(".feedback-type").value
                ],
                milestone: 1,
            }),
            headers: API.github.createIssue.headers
        }).then(res => res.json()).then(data => {
            if (data.message != "Not Found") {
                setIsOpen(false);
                setStatusMessage("Thank you for your feedback. We will try to fix the problem as soon as possible.")
            } else {
                setStatusMessage("An error occured. Please try again later.");
            }
        })
    }

    /* useEffect(() => {
        document.addEventListener("click", clickOutSide);
    }
    , []); */

    return <>
        <div className="bug-container">
            {(isOpen) ?
                <div className="bug-menu">
                    <div className="bug-menu-header">
                        <h2>Feedback</h2>
                    </div>
                    <div className="bug-menu-body">
                        {(statusMessage == null) ? "" : <p>{statusMessage}</p>}
                        <form className="bugSubmitForm" onSubmit={sendFeedback}>
                            <label>Title:</label>
                            <input className="bugReport-input --feedbackTitle" type="text" placeholder="Title" />
                            <section>
                                <label>What kind of feedback do you have?</label>
                                <select className="bugReport-input feedback-type">
                                    <option value="Bug">Bug</option>
                                    <option value="Feature">Feature</option>
                                    <option value="Other">Other</option>
                                </select>
                            </section>
                            <label>Describe your problem:</label>
                            <textarea className="bugReport-input --height --feedbackMessage" col="50" placeholder="Please describe your problem here..."></textarea>
                            <input className="bugReport-input" type="hidden" value={JSON.parse(appStorage.getItem("globals"))?.profile?.email} placeholder="email" />
                            <input className="bugReport-input" type="hidden" value={JSON.parse(appStorage.getItem("globals"))?.profile?.first_name + " " + JSON.parse(appStorage.getItem("globals"))?.profile?.last_name} placeholder="email" />

                            <button className="bugReport-send">Send feedback</button>
                        </form>
                    </div>
                </div> : null
            }
            <button className="send-feedback" onClick={openMenu}>
                Feedback
            </button>
        </div>
    </>
}