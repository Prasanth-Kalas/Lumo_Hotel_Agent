import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Lumo Hotel Agent",
  description: "Operator status for the Lumo Hotel Agent service.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
