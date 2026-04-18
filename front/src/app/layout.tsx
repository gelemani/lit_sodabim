import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import I18nProvider from "./i18n/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SodaBIM — Платформа для управления BIM-проектами",
    template: "%s | SodaBIM",
  },
  description:
    "SodaBIM — профессиональная платформа для управления BIM-моделями, совместной работы над IFC-файлами и комментирования строительных проектов.",
  keywords: ["BIM", "IFC", "строительство", "3D модели", "управление проектами", "SodaBIM"],
  authors: [{ name: "SodaBIM Team" }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "SodaBIM",
    title: "SodaBIM — Платформа для управления BIM-проектами",
    description:
      "Профессиональная платформа для управления BIM-моделями и совместной работы над IFC-файлами.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SodaBIM — Платформа для управления BIM-проектами",
    description: "Профессиональная BIM-платформа для строительных проектов.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1f252e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
