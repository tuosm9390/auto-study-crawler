import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "YouTube 학습 플랫폼 | NotebookLM 연동",
  description: "YouTube 채널 영상을 자동으로 수집하고 NotebookLM으로 분석하는 개인 학습 플랫폼",
  keywords: ["YouTube", "학습", "NotebookLM", "AI 분석"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
