import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { getCurrentProfile } from "@/lib/queries";

export const metadata: Metadata = {
  title: "黄泉广场",
  description: "个人精选图片广场与 AI 图像制作工作台"
};

const themeScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("yomi-theme");
    var preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = stored || preferred;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <SiteHeader profile={profile} />
        <main>{children}</main>
      </body>
    </html>
  );
}
