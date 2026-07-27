import "./Style.css";
export default function Highlighter(props){
    return <>
        <span className={"highlight " + props.type} >{props.children}</span>
    </>
}