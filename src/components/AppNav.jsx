import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

export function AppNav({ subtitle, title, backTo, subtitleClassName }) {
  return (
    <header className="rise">
      {backTo ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 h-8 shrink-0 gap-1 px-2 text-muted-foreground"
          asChild
        >
          <Link to={backTo}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Link>
        </Button>
      ) : null}
      <div className="min-w-0">
        <h1 className="font-display mb-0 text-3xl font-bold leading-tight text-balance">
          {title ? (
            title
          ) : (
            <Link
              to="/"
              className="inline-flex rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Tausta
            </Link>
          )}
        </h1>
        <p className={cn("m-0 mt-1 leading-relaxed text-pretty text-muted-foreground", subtitleClassName ?? "text-sm")}>
          {subtitle}
        </p>
      </div>
    </header>
  );
}
