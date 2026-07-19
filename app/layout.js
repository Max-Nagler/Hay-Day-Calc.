import "./globals.css";

export const metadata = {
  title: "Hay Day Calculator",
  description: "Rechner für Hay-Day-Produkte und Zutaten"
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
