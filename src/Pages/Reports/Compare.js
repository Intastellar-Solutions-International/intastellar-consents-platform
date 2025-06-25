import React from 'react';
import { useParams } from 'react-router-dom';


export default function Compare(props) {
    document.title = "Compare Domains | Intastellar Consents Solutions";
    const { handle, id } = useParams();
    return (
        <div className="compare">
            <h1>Compare Domains</h1>
        </div>
    );
}