import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "CSE Training System - Agora",
    description: "Internal Training Management System for Agora CSE Team",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
