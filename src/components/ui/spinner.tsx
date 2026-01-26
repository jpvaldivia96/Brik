import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <img
      src="/icon.png"
      alt="Cargando..."
      className={cn(
        'animate-spin-slow',
        sizeClasses[size],
        className
      )}
      style={{
        animation: 'spin 1.5s linear infinite',
      }}
    />
  );
}

