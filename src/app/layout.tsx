import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunardeli | Qualidade — Conferência de Projetos",
  description:
    "Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais. Ferramenta interna de produção e conferência de pranchas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
