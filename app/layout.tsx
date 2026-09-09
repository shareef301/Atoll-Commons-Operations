import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Atoll Commons · Operations',description:'Projects, governance, finance and compliance for Atoll Commons.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className="dark"><body>{children}</body></html>;}
