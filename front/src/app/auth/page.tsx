"use client";

import React, { useState, useEffect } from "react";
import { apiService } from "@/app/services/api.service";
import { useRouter } from "next/navigation";
import {
  formatPhoneInput,
  formatNameInput,
  formatEmailInput,
} from "@/app/utils/inputFormatters";

const inp: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#131720",
  border: "1px solid #2d3748",
  borderRadius: 8,
  color: "#f1f5f9",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const Field = ({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <label style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", letterSpacing: "0.03em" }}>
      {label}
    </label>
    {children}
    {hint && !error && <span style={{ fontSize: 11, color: "#475569" }}>{hint}</span>}
    {error && <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
  </div>
);

export function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoginData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const [registerData, setRegisterData] = useState({
    login: "",
    userName: "",
    userSurname: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    companyPosition: "",
    phone: "",
  });

  const handleRegisterChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    formatter?: (value: string) => string,
  ) => {
    let value = e.target.value;
    if (formatter) value = formatter(value);
    setRegisterData((prev) => ({ ...prev, [e.target.name]: value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
  };

  const toast = (text: string, type: "error" | "success" = "error") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogin = async () => {
    if (!loginData.username.trim() || !loginData.password.trim()) {
      toast("Введите логин и пароль");
      return;
    }
    setLoading(true);
    try {
      const response = await apiService.login({
        login: loginData.username.trim(),
        password: loginData.password.trim(),
      });
      if (response.success && response.data) {
        setIsAuthenticated(true);
        const { companyName, userSurname, userName, login, email, companyPosition, userId: uid } = response.data;
        localStorage.setItem("companyName", companyName ?? "");
        localStorage.setItem("userSurname", userSurname ?? "");
        localStorage.setItem("userName", userName ?? "");
        localStorage.setItem("login", login ?? "");
        localStorage.setItem("email", email ?? "");
        localStorage.setItem("companyPosition", companyPosition ?? "");
        localStorage.setItem("userId", String(uid ?? ""));
        router.push(`/projects?companyName=${encodeURIComponent(companyName ?? "")}`);
      } else {
        toast(response.error || "Неверный логин или пароль");
      }
    } catch {
      toast("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const required = ["login", "userName", "userSurname", "email", "password", "confirmPassword", "companyName", "companyPosition"] as const;
    const missing = required.filter((k) => !registerData[k].trim());
    if (missing.length) { toast("Заполните все обязательные поля"); return; }
    if (!emailRegex.test(registerData.email)) { toast("Введите корректный email"); return; }
    if (registerData.password !== registerData.confirmPassword) { toast("Пароли не совпадают"); return; }
    if (registerData.password.length < 6) { toast("Пароль должен быть не менее 6 символов"); return; }

    setLoading(true);
    try {
      const response = await apiService.register({
        login: registerData.login,
        userName: registerData.userName,
        userSurname: registerData.userSurname,
        email: registerData.email,
        password: registerData.password,
        companyName: registerData.companyName,
        companyPosition: registerData.companyPosition,
      });
      if (response.success && response.data) {
        setIsAuthenticated(true);
        const { companyName, userSurname, userName, login, email, companyPosition, userId: uid } = response.data;
        localStorage.setItem("companyName", companyName ?? "");
        localStorage.setItem("userSurname", userSurname ?? "");
        localStorage.setItem("userName", userName ?? "");
        localStorage.setItem("login", login ?? "");
        localStorage.setItem("email", email ?? "");
        localStorage.setItem("companyPosition", companyPosition ?? "");
        localStorage.setItem("userId", String(uid ?? ""));
        if (registerData.phone.trim()) localStorage.setItem("userPhone", registerData.phone);
        router.push(`/projects?companyName=${encodeURIComponent(companyName ?? "")}`);
      } else {
        if (response.error === "User already exists") {
          setErrors({ login: "Уже занят", email: "Email уже зарегистрирован" });
          toast("Пользователь с таким логином или email уже существует");
        } else {
          toast(response.error || "Ошибка регистрации");
        }
      }
    } catch {
      toast("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") activeTab === "login" ? void handleLogin() : void handleRegister();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", flexDirection: "column" }}>
      {/* Navbar */}
      <nav style={{ padding: "0 32px", height: 52, display: "flex", alignItems: "center", borderBottom: "1px solid #1e2433", background: "#0f1117" }}>
        <button onClick={() => router.push("/")}
          style={{ background: "none", border: "none", color: "#f1f5f9", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: -0.5, padding: 0 }}>
          SodaBIM
        </button>
      </nav>

      {/* Toast */}
      {toastMessage && (
        <div className="animate-fade-in" style={{
          position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)",
          background: toastMessage.type === "error" ? "#7f1d1d" : "#14532d",
          color: "#fef2f2", padding: "10px 20px", borderRadius: 8,
          border: `1px solid ${toastMessage.type === "error" ? "#ef4444" : "#22c55e"}`,
          fontSize: 13, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}>
          {toastMessage.text}
        </div>
      )}

      {/* Center card */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: 420, animation: "fadeIn 0.3s ease both" }}>
          {/* Logo mark */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 12, boxShadow: "0 4px 16px rgba(59,130,246,0.3)",
            }}>
              <svg width="22" height="22" fill="none" stroke="#fff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0, letterSpacing: -0.5 }}>
              {activeTab === "login" ? "Добро пожаловать" : "Создать аккаунт"}
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "6px 0 0", fontWeight: 400 }}>
              {activeTab === "login" ? "Войдите в SodaBIM" : "Начните работу с BIM-моделями"}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#131720", borderRadius: 10, padding: 4, marginBottom: 24, border: "1px solid #1e2433" }}>
            {(["login", "register"] as const).map(tab => (
              <button key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                  background: activeTab === tab ? "#1a1d24" : "transparent",
                  color: activeTab === tab ? "#f1f5f9" : "#64748b",
                  boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
                }}>
                {tab === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>

          {/* Form card */}
          <div style={{ background: "#131720", border: "1px solid #1e2433", borderRadius: 14, padding: "24px 24px 20px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
            {activeTab === "login" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }} onKeyDown={onKey}>
                <Field label="Логин">
                  <input name="username" type="text" placeholder="Введите логин"
                    value={loginData.username} onChange={handleLoginChange}
                    style={inp}
                    onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                    onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                </Field>
                <Field label="Пароль">
                  <input name="password" type="password" placeholder="Введите пароль"
                    value={loginData.password} onChange={handleLoginChange}
                    style={inp}
                    onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                    onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                </Field>
                <button onClick={() => void handleLogin()} disabled={loading}
                  style={{
                    width: "100%", padding: "11px", marginTop: 4,
                    background: loading ? "#1e3a5f" : "linear-gradient(135deg,#3b82f6,#2563eb)",
                    color: "#fff", border: "none", borderRadius: 9, cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 600, transition: "opacity 0.15s", opacity: loading ? 0.7 : 1,
                    boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                  }}>
                  {loading ? "Вход..." : "Войти"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }} onKeyDown={onKey}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Имя" error={errors.userName}>
                    <input name="userName" type="text" placeholder="Иван" value={registerData.userName}
                      onChange={(e) => handleRegisterChange(e, formatNameInput)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = errors.userName ? "#ef4444" : "#2d3748"; }} />
                  </Field>
                  <Field label="Фамилия" error={errors.userSurname}>
                    <input name="userSurname" type="text" placeholder="Иванов" value={registerData.userSurname}
                      onChange={(e) => handleRegisterChange(e, formatNameInput)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = errors.userSurname ? "#ef4444" : "#2d3748"; }} />
                  </Field>
                </div>
                <Field label="Логин" error={errors.login}>
                  <input name="login" type="text" placeholder="ivan_ivanov" value={registerData.login}
                    onChange={(e) => handleRegisterChange(e)} style={{ ...inp, borderColor: errors.login ? "#ef4444" : "#2d3748" }}
                    onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                    onBlur={e => { e.target.style.borderColor = errors.login ? "#ef4444" : "#2d3748"; }} />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input name="email" type="text" placeholder="ivan@company.ru" value={registerData.email}
                    onChange={(e) => handleRegisterChange(e, formatEmailInput)} style={{ ...inp, borderColor: errors.email ? "#ef4444" : "#2d3748" }}
                    onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                    onBlur={e => { e.target.style.borderColor = errors.email ? "#ef4444" : "#2d3748"; }} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Пароль" error={errors.password}>
                    <input name="password" type="password" placeholder="Мин. 6 символов" value={registerData.password}
                      onChange={(e) => handleRegisterChange(e)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                  </Field>
                  <Field label="Повторите пароль" error={errors.confirmPassword}>
                    <input name="confirmPassword" type="password" placeholder="Повторите" value={registerData.confirmPassword}
                      onChange={(e) => handleRegisterChange(e)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Компания" error={errors.companyName}>
                    <input name="companyName" type="text" placeholder='ООО "Проект"' value={registerData.companyName}
                      onChange={(e) => handleRegisterChange(e)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                  </Field>
                  <Field label="Должность" error={errors.companyPosition}>
                    <input name="companyPosition" type="text" placeholder="BIM-менеджер" value={registerData.companyPosition}
                      onChange={(e) => handleRegisterChange(e, formatNameInput)} style={inp}
                      onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                      onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                  </Field>
                </div>
                <Field label="Телефон" hint="Необязательно">
                  <input name="phone" type="tel" placeholder="+7 (912) 345-67-89" value={registerData.phone}
                    onChange={(e) => handleRegisterChange(e, formatPhoneInput)} style={inp}
                    onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                    onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
                </Field>
                <button onClick={() => void handleRegister()} disabled={loading}
                  style={{
                    width: "100%", padding: "11px", marginTop: 4,
                    background: loading ? "#1e3a5f" : "linear-gradient(135deg,#3b82f6,#2563eb)",
                    color: "#fff", border: "none", borderRadius: 9, cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 600, transition: "opacity 0.15s", opacity: loading ? 0.7 : 1,
                    boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                  }}>
                  {loading ? "Регистрация..." : "Создать аккаунт"}
                </button>
              </div>
            )}
          </div>

          {/* Switch link */}
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#64748b" }}>
            {activeTab === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
            <button onClick={() => setActiveTab(activeTab === "login" ? "register" : "login")}
              style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, padding: 0, fontWeight: 500 }}>
              {activeTab === "login" ? "Зарегистрироваться" : "Войти"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
