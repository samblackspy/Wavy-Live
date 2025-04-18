"use client"; // Keep if needed for UI package context

import { ReactNode } from "react";

 interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
   children: ReactNode;
  className?: string;
   
}

export const Button = ({ children, className, ...props }: ButtonProps) => {
 

  return (
      <button
          className={className} 
          {...props}           >
          {children}
      </button>
  );
};