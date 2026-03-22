import React from 'react';
import { cn } from './cn';

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div
    className={cn(
      'rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5',
      className
    )}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('flex flex-col gap-1 border-b border-slate-100 p-4 sm:p-5', className)}>{children}</div>
);

export const CardTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <h2 className={cn('text-lg font-bold tracking-tight text-slate-900 sm:text-xl', className)}>{children}</h2>
);

export const CardDescription: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children
}) => <p className={cn('text-sm leading-relaxed text-slate-600', className)}>{children}</p>;

export const CardContent: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('p-4 sm:p-5', className)}>{children}</div>
);
