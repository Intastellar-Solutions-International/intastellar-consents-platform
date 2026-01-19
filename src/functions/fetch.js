const Fetch = async (url, method, headers, body, signal, responseType = 'json') => {
    // For PDF requests, use different fetch options
    const fetchOptions = { method: method, body, signal };
    
    if (responseType !== 'pdf') {
        fetchOptions.headers = headers;
    } else {
        // For PDF, only include essential headers
        fetchOptions.headers = {
            'Authorization': headers?.Authorization,
            'Organisation': headers?.Organisation,
            'FromDate': headers?.FromDate,
            'ToDate': headers?.ToDate
        };
    }

    const t = fetch(url, fetchOptions).then(async (res) => {
        
        if (res.status === 401) {
            return "Err_Login_Expired";
        } else if (res.status === 403) {
            return "Err_No_Permission";
        } else if (res.status === 404) {
            return "Err_Not_Found";
        } else if (res.status === 500) {
            // Log the response text to see the actual PHP error
            const errorText = await res.text();
            console.error('Server error response:', errorText);
            return "Err_Server_Error";
        } 

        if (await res.text() === "Err_Login_Expired"){
            window.location.href = "/login";
            return;
        }

        try {
            if (responseType === 'pdf' || res.headers.get('content-type')?.includes('application/pdf')) {
                const blob = await res.blob();
                console.log('PDF blob size:', blob.size);
                
                // Check if blob is actually a PDF
                if (blob.size === 0) {
                    throw new Error("Received empty PDF");
                }

                await downloadPDF(blob, 'Intastellar_Consents_Report_' + new Date().toISOString().slice(0, 10) + '.pdf');
                return "PDF Downloaded Successfully";
            } else {
                const text = await res.text();
                console.log('Response text:', text);
                
                // Check if the response is actually JSON
                if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                    return JSON.parse(text);
                } else {
                    if (text === "Err_Login_Expired") {
                        window.location.href = "/login";
                        return;
                    }
                }
            }
        } catch (error) {
            throw new Error("Failed to parse response: " + error.message);
        }
    }).catch(error => {
        console.error("Fetch error:", error);
        throw error;
    });
    return t;
}

async function downloadPDF(blob, filename = 'document.pdf') {
    console.log(blob);
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export default Fetch;