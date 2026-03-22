import React from 'react';
import { cn } from './cn';

type BadgeVariant = 'default' | 'secondary' | 'outline';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[#8C3A36]/10 text-[#8C3A36] border-[#8C3A36]/20',
  secondary: 'bg-slate-100 text-slate-700 border-slate-200',
  outline: 'bg-white text-slate-600 border-slate-200'
};

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}> = ({ children, variant = 'default', className }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide',
      variants[variant],
      className
    )}
  >
    {children}
  </span>
);
