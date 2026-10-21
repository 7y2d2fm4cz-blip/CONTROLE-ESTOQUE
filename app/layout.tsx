import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Almoxarifado | Controle de Estoque",
  description: "Recebimento de notas e controle de materiais da obra",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
