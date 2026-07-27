import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function GlassCard({ children, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/20 bg-white/60 p-6 shadow-glass backdrop-blur-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
