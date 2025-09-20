import "./style.css";
const useRef = window.React.useRef;
const useState = window.React.useState;
export default function FAQS({faq}){
    const [activeIndex, setActiveIndex] = useState(null);
    const contentHeight = useRef()

    function openClose(index){
        setActiveIndex((prevIndex) => (prevIndex === index ? null : index));
    }

    return (
        faq.map((faq, i) => {
            return (
                <article key={i} className="question">
                    <h3 onClick={() => {
                        openClose(i)
                    }} className="accordion"><span className="arrow arrowDown"></span> {faq.question}</h3>
                    <div ref={contentHeight} className="panel" style={
                        activeIndex === i ?
                            { height: contentHeight.current.scrollHeight }
                            : { height: "0px" }
                    }>
                        <section className="panel-ppad">
                            <p>{faq.answer}</p>
                        </section>
                    </div>
                </article>
            ) 
        })
    )
}