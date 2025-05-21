import { Leaf } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface LogoProps extends LucideProps {
  showText?: boolean;
}

export function Logo({ className, showText = true, ...props }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <Leaf className={className || "h-8 w-8 text-primary"} {...props} />
      {showText && <span className="text-xl font-semibold text-primary">GreenView</span>}
    </div>
  );
}
