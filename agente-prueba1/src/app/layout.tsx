import "./globals.css";
import type { Metadata } from "next";
export const metadata:Metadata={title:"Agente WhatsApp",description:"Dashboard de WhatsApp Cloud API"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
