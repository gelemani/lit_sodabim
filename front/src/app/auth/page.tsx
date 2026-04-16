"use client";

import React, { useState, useEffect } from "react";
import { apiService } from "@/app/services/api.service";
import { useRouter } from "next/navigation";
import {
  formatPhoneInput,
  formatNameInput,
  formatEmailInput,
} from "@/app/utils/inputFormatters";

export function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) setUserId(storedUserId);
  }, []);

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

  const handleLogin = async () => {
    if (loginData.username.trim() && loginData.password.trim()) {
      try {
        const response = await apiService.login({
          login: loginData.username.trim(),
          password: loginData.password.trim(),
        });

        if (response.success && response.data) {
          setIsAuthenticated(true);
          const {
            companyName,
            userSurname,
            userName,
            login,
            email,
            companyPosition,
            userId: uid,
          } = response.data;

          localStorage.setItem("companyName", companyName ?? "");
          localStorage.setItem("userSurname", userSurname ?? "");
          localStorage.setItem("userName", userName ?? "");
          localStorage.setItem("login", login ?? "");
          localStorage.setItem("email", email ?? "");
          localStorage.setItem("companyPosition", companyPosition ?? "");
          localStorage.setItem("userId", String(uid ?? ""));
          router.push(
            `/projects?companyName=${encodeURIComponent(companyName ?? "")}`,
          );
        } else {
          setToastMessage(response.error || "Ошибка авторизации");
          setTimeout(() => setToastMessage(null), 3000);
        }
      } catch (error) {
        console.error("Ошибка при попытке войти:", error);
        setToastMessage("Произошла ошибка при авторизации.");
        setTimeout(() => setToastMessage(null), 3000);
      }
    } else {
      setToastMessage("Введите имя пользователя и пароль");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !registerData.login.trim() ||
      !registerData.userName.trim() ||
      !registerData.userSurname.trim() ||
      !registerData.email.trim() ||
      !registerData.password.trim() ||
      !registerData.confirmPassword.trim() ||
      !registerData.companyName.trim() ||
      !registerData.companyPosition.trim()
    ) {
      setToastMessage("Заполните все поля для регистрации");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (!emailRegex.test(registerData.email)) {
      setToastMessage("Введите корректный email");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      setToastMessage("Пароли не совпадают");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

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
        const {
          companyName,
          userSurname,
          userName,
          login,
          email,
          companyPosition,
          userId: uid,
        } = response.data;

        localStorage.setItem("companyName", companyName ?? "");
        localStorage.setItem("userSurname", userSurname ?? "");
        localStorage.setItem("userName", userName ?? "");
        localStorage.setItem("login", login ?? "");
        localStorage.setItem("email", email ?? "");
        localStorage.setItem("companyPosition", companyPosition ?? "");
        localStorage.setItem("userId", String(uid ?? ""));
        if (registerData.phone.trim()) {
          localStorage.setItem("userPhone", registerData.phone);
        }
        router.push(
          `/projects?companyName=${encodeURIComponent(companyName ?? "")}`,
        );
      } else {
        if (response.error === "User already exists") {
          setErrors({
            login: "Пользователь уже существует",
            email: "Email уже зарегистрирован",
          });
          setToastMessage(
            "Пользователь с таким логином или email уже зарегистрирован",
          );
          setTimeout(() => setToastMessage(null), 3000);
        } else {
          setToastMessage(response.error || "Ошибка регистрации");
          setTimeout(() => setToastMessage(null), 3000);
        }
      }
    } catch (error) {
      console.error("Ошибка при попытке зарегистрироваться:", error);
      setToastMessage("Произошла ошибка при регистрации.");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const buttonStyle = {
    padding: "10px 20px",
    marginTop: "14px",
    width: "300px",
    borderRadius: "10px",
  };

  return (
    <>
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "30%",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#ff4d4f",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {toastMessage}
        </div>
      )}
      <div
        style={{
          position: "fixed",
          top: "0",
          left: "0",
          width: "100%",
          backgroundColor: "#242B35",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          color: "white",
          fontSize: "1.5em",
          fontWeight: "bold",
          zIndex: 1000,
          boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            color: "white",
            fontSize: "0.9em",
            cursor: "pointer",
            padding: "4px 8px",
            marginRight: 8,
          }}
          title="Назад"
        >
          ← Назад
        </button>
        <span style={{ marginLeft: "4px" }}>SodaBIM</span>
      </div>

      <div
        className="auth-container"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {activeTab === "login" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              padding: "44px",
              backgroundColor: "#242B35",
              borderRadius: "4px",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
              width: "450px",
              marginTop: "170px",
              border: "1px solid #1F252E",
            }}
          >
            <h1 style={{ fontSize: "1.2em", paddingBottom: "2.6px" }}>
              {activeTab === "login" ? "Войти" : "Регистрация"}
            </h1>
            <p>Логин</p>
            <input
              name="username"
              type="text"
              placeholder="Логин"
              value={loginData.username}
              onChange={handleLoginChange}
            />
            <p>Пароль</p>
            <input
              name="password"
              type="password"
              placeholder="Пароль"
              value={loginData.password}
              onChange={handleLoginChange}
            />
            <button onClick={handleLogin} style={buttonStyle}>
              Войти
            </button>
            <h4>
              Нет аккаунта?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("register");
                }}
              >
                Зарегистрироваться
              </a>
            </h4>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              padding: "70px",
              backgroundColor: "#242B35",
              borderRadius: "4px",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
              width: "450px",
              marginTop: "85px",
              border: "1px solid #1F252E",
            }}
          >
            <h1 style={{ fontSize: "1.2em", paddingBottom: "2.6px" }}>
              Регистрация
            </h1>
            <p>Логин</p>
            <input
              name="login"
              type="text"
              placeholder="Логин"
              value={registerData.login}
              onChange={(e) => handleRegisterChange(e)}
            />
            {errors.login && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.login}
              </span>
            )}

            <p>Имя</p>
            <input
              name="userName"
              type="text"
              placeholder="Имя"
              value={registerData.userName}
              onChange={(e) => handleRegisterChange(e, formatNameInput)}
            />
            {errors.userName && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.userName}
              </span>
            )}

            <p>Фамилия</p>
            <input
              name="userSurname"
              type="text"
              placeholder="Фамилия"
              value={registerData.userSurname}
              onChange={(e) => handleRegisterChange(e, formatNameInput)}
            />
            {errors.userSurname && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.userSurname}
              </span>
            )}

            <p>Email</p>
            <input
              name="email"
              type="text"
              placeholder="customer@mail.ru"
              value={registerData.email}
              onChange={(e) => handleRegisterChange(e, formatEmailInput)}
            />
            {errors.email && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.email}
              </span>
            )}

            <p>Телефон</p>
            <input
              name="phone"
              type="tel"
              placeholder="+7 (912) 345-67-89"
              value={registerData.phone}
              onChange={(e) => handleRegisterChange(e, formatPhoneInput)}
            />
            <span
              style={{
                color: "gray",
                fontSize: "12px",
                alignSelf: "flex-start",
              }}
            >
              Необязательно
            </span>

            <p>Пароль</p>
            <input
              name="password"
              type="password"
              placeholder="Пароль"
              value={registerData.password}
              onChange={(e) => handleRegisterChange(e)}
            />
            {errors.password && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.password}
              </span>
            )}

            <p>Подтвердите пароль</p>
            <input
              name="confirmPassword"
              type="password"
              placeholder="Подтвердите пароль"
              value={registerData.confirmPassword}
              onChange={(e) => handleRegisterChange(e)}
            />
            {errors.confirmPassword && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.confirmPassword}
              </span>
            )}

            <p>Название компании</p>
            <input
              name="companyName"
              type="text"
              placeholder='ООО "Солнышко"'
              value={registerData.companyName}
              onChange={(e) => handleRegisterChange(e)}
            />
            {errors.companyName && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.companyName}
              </span>
            )}

            <p>Должность</p>
            <input
              name="companyPosition"
              type="text"
              placeholder="CEO"
              value={registerData.companyPosition}
              onChange={(e) => handleRegisterChange(e, formatNameInput)}
            />
            {errors.companyPosition && (
              <span style={{ color: "red", fontSize: "12px" }}>
                {errors.companyPosition}
              </span>
            )}

            <button onClick={handleRegister} style={buttonStyle}>
              Зарегистрироваться
            </button>
            <h4>
              Уже есть аккаунт?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("login");
                }}
              >
                Войти
              </a>
            </h4>
          </div>
        )}
      </div>
    </>
  );
}

export default LoginPage;
