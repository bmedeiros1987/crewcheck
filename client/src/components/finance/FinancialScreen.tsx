import { createContext, useContext, type ReactNode } from 'react';
export type FinancialScreenName='overview'|'statement'|'charts'|'payment';
export const FinancialScreenContext=createContext<{screen:FinancialScreenName;navigate:(screen:FinancialScreenName)=>void;back?:()=>void;currency?:string;setCurrency?:(currency:string)=>void;controls?:ReactNode;history?:ReactNode}>({screen:'overview',navigate:()=>{}});
export const useFinancialScreen=()=>useContext(FinancialScreenContext);
export default function FinancialScreen({ names, children }: { names:FinancialScreenName[];children:ReactNode }) {
  const {screen}=useFinancialScreen();
  return <div className="cc-financial-screen" hidden={!names.includes(screen)}>{children}</div>;
}
