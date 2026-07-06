import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function AppNav({ subtitle }) {
  const { pathname } = useLocation();
  const onScreener = pathname.startsWith("/screener");

  return (
    <header className="rise">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display mb-0 mt-0.5 text-3xl font-bold leading-tight">
          <Link
            to="/"
            className="inline-flex rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Tausta
          </Link>
        </h1>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          <Link
            to="/screener"
            className={cn(
              "rounded-md px-2 py-0.5 transition-colors",
              onScreener
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Screener
          </Link>
        </nav>
      </div>
      <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </header>
  );
}
