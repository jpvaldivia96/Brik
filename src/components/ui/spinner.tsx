import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** 'light' = white isotipo (for purple backgrounds), 'dark' = black isotipo (for light backgrounds like login) */
  variant?: 'light' | 'dark';
  className?: string;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function Spinner({ size = 'md', variant = 'light', className }: SpinnerProps) {
  const src = variant === 'light'
    ? '/spinner-isotipo-white.png'  // White for purple backgrounds
    : '/spinner-isotipo.png';        // Black for light backgrounds

  return (
    <img
      src={src}
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


