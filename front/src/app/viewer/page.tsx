'use client';
import React, { useEffect, useState } from "react";
import Viewer from "@/app/components/viewer";
import Header from "@/app/components/header";

const ViewerPage = () => {
    const [file, setFile] = useState<File | null>(null);
    const [companyName, setCompanyName] = useState<string>("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            const storedCompanyName = localStorage.getItem("companyName") || "";
            setCompanyName(storedCompanyName);
        }
    }, []);

    useEffect(() => {
        const fileUrl = sessionStorage.getItem("viewerFileUrl");
        const fileName = sessionStorage.getItem("viewerFileName") || "model.ifc";
        const fileType = sessionStorage.getItem("viewerFileType") || "model/ifc";

        if (!fileUrl) return;

        fetch(fileUrl)
            .then(res => res.blob())
            .then(blob => {
                const fileFromUrl = new File([blob], fileName, { type: fileType });
                setFile(fileFromUrl);
                console.log("IFC файл загружен по URL:", fileFromUrl);
            })
            .catch(e => {
                console.error("Ошибка при загрузке файла по URL:", e);
            });
    }, []);

    return (<>
            <Header centralString={companyName} backHref="/projectFiles" />
            <div style={{marginTop: "44px"}}>
                <Viewer isAuthenticated={true} file={file}/>
            </div>
        </>
    )
};

export default ViewerPage;