import "./Style.css";
const { useState, useEffect, useRef } = React;
export default function SuccessWindow(props) {
    const [Style, setStyle] = useState(props?.style);
    function closeWindow() {
        setStyle(
            {
                right: "-100%",
            }
        )
    }

    setTimeout(() => {
        closeWindow();
    }, 5000);

    return (
        <>
            <div style={Style} className="successWindow">
                <div className="successWindow-content">
                    {props?.message}
                </div>
            </div>
        </>
    )
}