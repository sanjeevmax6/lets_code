import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Practice Forge — your coding workspace',description:'Turn an idea into a runnable practice problem. Python-first coding, tests, research and hints.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body>{children}</body></html>}
