import "./Style.css";
export default function Email(props){
    return(
        <div className="flex flex-col gap-2">
            <label htmlFor={props?.id} className="text-sm font-medium">{props?.label}</label>
            <input
                placeholder={props?.placeholder}
                className="intInput"
                autoComplete={props?.autoComplete ?? "off"}
                type="email"
                onChange={props.onChange}
                id={props?.id}
                {...(props.value !== undefined ? { value: props.value } : {})}
            />
        </div>
    )
}