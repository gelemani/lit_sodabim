"use client";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./ru";

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: { ru: ru },
      lng: "ru",
      fallbackLng: "ru",
      interpolation: { escapeValue: false },
    });
}

export default i18n;
