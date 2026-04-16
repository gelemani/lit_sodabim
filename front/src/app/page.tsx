"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
// import Viewer from "@/app/components/viewer";
// import ProjectsPage from "@/app/projects";

const Page = (): React.JSX.Element | null => {
    const router = useRouter();
    const [companyName, setCompanyName] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch companyName from localStorage
        if (typeof window !== "undefined") {
            const storedCompanyName = localStorage.getItem("companyName") || "";
            setCompanyName(storedCompanyName);
        }
    }, []);

    useEffect(() => {
        const isLoggedIn = localStorage.getItem("token") !== null;
        // console.log(localStorage.getItem("token"))
        // console.log("Проверка токена:", isLoggedIn);
        if (isLoggedIn) {
            router.push(`/projects?companyName=${encodeURIComponent(companyName ?? "")}`);
        } else {
            setLoading(false);
        }
    }, [companyName, router]);

    if (loading) return null;

return (
    <div className="flex items-center justify-center h-screen text-white" style={{ backgroundColor: "#1F252E" }}>
        <div className="text-center space-y-6">
            <h1 className="text-5xl font-bold tracking-tight">Добро пожаловать в SodaBIM</h1>
            <p className="text-lg text-gray-300">
                Интеллектуальное управление строительными проектами — альтернатива BIM360
            </p>
            <button
                onClick={() => router.push("/auth/")}
                className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
            >
                Войти в систему
            </button>
        </div>
    </div>
);
};

export default Page;