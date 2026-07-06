import { Link } from "react-router-dom";

export function AppNav({ subtitle }) {
  return (
    <header className="rise">
      <h1 className="font-display mb-0 mt-0.5 text-3xl font-bold leading-tight">
        <Link
          to="/"
          className="inline-flex rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Tausta
        </Link>
      </h1>
      <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </header>
  );
}
