import React from 'react';
import { cn } from './cn';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} aria-hidden />
);
