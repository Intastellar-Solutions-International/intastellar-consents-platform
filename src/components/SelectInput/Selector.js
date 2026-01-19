const { useState, useEffect, useRef, useContext } = React;
import "./Style.css";
export default function Select(props){
    const [isOpen, setIsOpen] = useState(false);
    // Search input ref
    const searchInput = useRef(null);

    function searchItems(query){
        let items = document.querySelectorAll(".dropdown-menu__content li");
        console.log("Items:", items, query);
        items.forEach((item) => {
            if(item.innerText.toLowerCase().includes(query.toLowerCase())){
                item.style.display = "flex";
            }else{
                item.style.display = "none";
            }
        });
    }

    function isJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    function openMenu(){
        setIsOpen(!isOpen);
    }

    function clickOutSide(e){
        if(e.target.className !== "dropdown-menu-button" && e.target !== searchInput.current){
            setIsOpen(false);
        }
    }

    useEffect(() => {
        document.addEventListener("click", clickOutSide);
    }, []);

    console.log("Select props:", props);

    return <>
        <div className="selectorContianer" style={props.style}>
            <div className="selector">
                {(props.icon) ? <i className={props.icon}></i> : null}
                <button className="dropdown-menu-button" style={props?.style2} onClick={openMenu}>
                    {
                        (isJson(props.defaultValue)) ?
                        <>
                            {
                                (JSON.parse(props.defaultValue).icon) ? 
                                <img className="company-logo" src={JSON.parse(props.defaultValue).icon} alt={JSON.parse(props.defaultValue).name} />
                                : null
                            }
                            {JSON.parse(props.defaultValue).name}
                        </>
                        :
                        props.defaultValue
                    }
                </button>
                {(isOpen) ? 
                <div className="dropdown-menu">
                    <ul className="dropdown-menu__content" style={props.style}>
                        <div className="search-box">
                            <input className="search-input" onChange={(e) => searchItems(e.target.value)} ref={searchInput} type="search" name="q" placeholder="Search" />
                        </div>
                        {
                            props?.items?.map((item, key) => {
                                if(isJson(item)){
                                    item = JSON.parse(item);
                                    return <>
                                        <li onClick={() => props.onChange(JSON.stringify({ id: item.id, name: item.name }))} key={item.id}>
                                            {(item?.icon) ? <img src={item.icon} alt={item.name} /> : null}
                                            {item.name}
                                        </li>
                                    </> 
                                }else if(typeof item === "object" && item?.uri){
                                    return <>
                                        <li onClick={() => props.onChange(
                                            JSON.stringify(
                                                {
                                                    name: item.type,
                                                    uri: item.uri,
                                                }
                                            )
                                        )} key={item.uri}>
                                            {(item?.icon) ? <img src={item.icon} alt={item.name} /> : null}
                                            {item.type}
                                        </li>
                                    </> 
                                }else if(typeof item === "object"){
                                    return <>
                                        <li style={{display: "flex", alignItems: "center"}} onClick={() => props.onChange(JSON.stringify({
                                            id: item.id,
                                            name: item.name,
                                            access: item.access,
                                        }))} key={item.id}>
                                            {(item?.icon && item.icon != "undefined") ? <img className="company-logo" src={item.icon} alt={item.name} /> : null}
                                            {item.name}
                                        </li>
                                    </> 
                                }else {
                                    return <>
                                        <li onClick={(e) => props.onChange(e.target.innerText)} key={item} value={item}>
                                            {(item?.icon) ? <img src={item.icon} alt={item.name} /> : null}
                                            {item}
                                        </li>
                                    </>
                                }
                            })
                        }
                    </ul>
                </div> : null
                }
            </div>
        </div>
    </>
}