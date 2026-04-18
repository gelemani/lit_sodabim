"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiService } from "@/app/services/api.service";

interface HeaderProps {
  centralString?: string;
  backHref?: string;
}

function getInitials(name: string, surname: string): string {
  return [(name || "?")[0], (surname || "")[0]].filter(Boolean).join("").toUpperCase();
}

function avatarGradient(login: string): string {
  const gradients = [
    "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    "linear-gradient(135deg,#06b6d4,#3b82f6)",
    "linear-gradient(135deg,#8b5cf6,#ec4899)",
    "linear-gradient(135deg,#22c55e,#3b82f6)",
    "linear-gradient(135deg,#f97316,#ef4444)",
    "linear-gradient(135deg,#a855f7,#3b82f6)",
  ];
  const idx = login.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

const Header: React.FC<HeaderProps> = ({ centralString, backHref }) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [userName, setUserName] = useState("");
  const [userSurname, setUserSurname] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyPosition, setCompanyPosition] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("token") ?? localStorage.getItem("authToken");
        const id = parseInt(localStorage.getItem("userId") ?? "0");
        let res = token ? await apiService.getMe() : null;
        if (!res?.success && id > 0) res = await apiService.getUserInfo(id);
        if (!res?.success || !res.data) return;
        const u = res.data;
        setLogin(u.login ?? "");
        setUserName(u.userName ?? "");
        setUserSurname(u.userSurname ?? "");
        setEmail(u.email ?? "");
        setCompanyName(u.companyName ?? "");
        setCompanyPosition(u.companyPosition ?? "");
      } catch { /* ignore */ }
    })();
  }, []);

  // Закрываем меню при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = getInitials(userName, userSurname);
  const gradient = avatarGradient(login || "user");
  const displayName = [userName, userSurname].filter(Boolean).join(" ") || "Пользователь";

  return (
    <>
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: 50,
        backgroundColor: "#1a1d24",
        borderBottom: "1px solid #2d3748",
        display: "flex", alignItems: "center", padding: "0 20px",
        boxSizing: "border-box", color: "white",
        fontWeight: "bold", fontSize: "1.2em",
        zIndex: 1000,
        boxShadow: "0 1px 0 #2d3748",
      }}>
        {/* Логотип */}
        <button
          style={{ background: "none", border: "none", color: "white", fontSize: "1em", fontWeight: 700, cursor: "pointer", padding: 0, letterSpacing: -0.5 }}
          onClick={() => router.push(`/projects?companyName=${encodeURIComponent(centralString ?? "")}`)}
          title="На главную"
        >
          SodaBIM
        </button>

        {/* Центральный заголовок */}
        {centralString && (
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            fontWeight: 500, fontSize: "0.85em", color: "#94a3b8",
            pointerEvents: "none", userSelect: "none", maxWidth: "40%",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {centralString}
          </div>
        )}

        {/* Аватар + меню */}
        <div ref={menuRef} style={{ marginLeft: "auto", position: "relative" }}>
          <button
            onClick={() => setMenuOpen(p => !p)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", alignItems: "center", gap: 10,
            }}
            aria-label="Меню пользователя"
          >
            {/* Аватар */}
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: gradient,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff",
              flexShrink: 0, letterSpacing: -0.5,
              transition: "box-shadow 0.15s",
              boxShadow: menuOpen ? "0 0 0 2px #3b82f6" : "none",
            }}>
              {initials}
            </div>
            <svg width="14" height="14" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"
              style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Дропдаун */}
          {menuOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: "absolute", top: 44, right: 0,
                background: "#1a1d24", border: "1px solid #2d3748",
                borderRadius: 12, padding: 6,
                width: 230, zIndex: 2000,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              {/* Пользователь */}
              <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid #2d3748", marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>{displayName}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{email || login}</div>
                {companyPosition && (
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{companyPosition}{companyName ? ` · ${companyName}` : ""}</div>
                )}
              </div>

              {/* Пункты меню */}
              {[
                {
                  icon: <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
                  label: "Профиль",
                  onClick: () => { setMenuOpen(false); router.push("/profile"); },
                },
                {
                  icon: <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
                  label: "Мои проекты",
                  onClick: () => { setMenuOpen(false); router.push(`/projects?companyName=${encodeURIComponent(companyName)}`); },
                },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    width: "100%", background: "transparent", border: "none",
                    color: "#e2e8f0", fontSize: 13, padding: "9px 12px",
                    borderRadius: 8, cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 10, textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#252a33"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: "#94a3b8" }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}

              {/* Выход */}
              <div style={{ borderTop: "1px solid #2d3748", marginTop: 4, paddingTop: 4 }}>
                <button
                  onClick={() => { apiService.logout(); router.push("/"); }}
                  style={{
                    width: "100%", background: "transparent", border: "none",
                    color: "#ef4444", fontSize: 13, padding: "9px 12px",
                    borderRadius: 8, cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 10, textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1c1215"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Выйти
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Кнопка "Назад" */}
      {backHref && (
        <button
          type="button"
          aria-label="Назад"
          onClick={() => router.push(backHref)}
          style={{
            position: "fixed", top: 58, left: 16, zIndex: 999,
            width: 36, height: 36, borderRadius: "50%",
            border: "1px solid #374151", background: "#1a1d24",
            color: "#94a3b8", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)", padding: 0,
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#252a33"; e.currentTarget.style.color = "#e2e8f0"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#1a1d24"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
    </>
  );
};

export default Header;
