import type { Metadata } from "next";
import { Kalam, Patrick_Hand, ZCOOL_KuaiLe, Ma_Shan_Zheng } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const kalam = Kalam({
  weight: ["300", "400", "700"],
  subsets: ["latin"],
  variable: "--font-heading",
});

const patrickHand = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-body",
});

const zcoolKuaiLe = ZCOOL_KuaiLe({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-chinese-heading",
});

const maShanZheng = Ma_Shan_Zheng({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-chinese-body",
});

export const metadata: Metadata = {
  title: "Swarm - Agent集群系统",
  description: "通用办公助手Agent集群系统，支持信息搜集、文档撰写、代码编程、多文件处理等",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${kalam.variable} ${patrickHand.variable} ${zcoolKuaiLe.variable} ${maShanZheng.variable} antialiased font-body bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
