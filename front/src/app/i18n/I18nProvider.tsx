"use client";
import { ReactNode } from "react";
import "./config";

export default function I18nProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
