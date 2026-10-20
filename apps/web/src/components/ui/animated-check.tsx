import { cn } from "@/lib/utils";

/** Өөрсдөө зурагддаг тойрог ба тик, "амжилттай" гэдэгт (захиалгын баталгаажуулалт). */
export function AnimatedCheck({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 52 52"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-14", className)}
    >
      <circle
        cx="26"
        cy="26"
        r="23"
        stroke="currentColor"
        pathLength={100}
        strokeDasharray={100}
        style={{ "--len": 100 } as React.CSSProperties}
        className="animate-draw"
      />
      <path
        d="M15 27.5l8 8 15-17"
        stroke="currentColor"
        pathLength={100}
        strokeDasharray={100}
        style={{ "--len": 100, animationDelay: "350ms" } as React.CSSProperties}
        className="animate-draw"
      />
    </svg>
  );
}
