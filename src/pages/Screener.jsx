import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownIcon, FilterIcon, SearchIcon } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { fmt } from "../../lib/format.js";

const PRESETS = [
  {
    id: "deep_value",
    label: "Deep value",
    hint: "Many undervalued signals",
    params: { minUnder: 6, minPiotroski: 0, altmanZone: "", sort: "under" },
  },
  {
    id: "quality",
    label: "Quality + cheap",
    hint: "Cheap with solid F-Score",
    params: { minUnder: 4, minPiotroski: 6, altmanZone: "", sort: "composite" },
  },
  {
    id: "contrarian",
    label: "Contrarian",
    hint: "Cheap but distressed",
    params: { minUnder: 5, minPiotroski: 0, altmanZone: "distress", sort: "under" },
  },
];

const SORT_OPTIONS = [
  { id: "composite", label: "Composite score" },
  { id: "under", label: "Undervalued count" },
  { id: "piotroski", label: "Piotroski F-Score" },
  { id: "altman", label: "Altman Z-Score" },
];

function verdictSummary(row) {
  const parts = [];
  if (row.undervalued_count) parts.push(`${row.undervalued_count}U`);
  if (row.fair_count) parts.push(`${row.fair_count}F`);
  if (row.overvalued_count) parts.push(`${row.overvalued_count}O`);
  if (row.caution_count) parts.push(`${row.caution_count}C`);
  return parts.join(" / ") || "—";
}

function scoreTone(score) {
  if (score == null) return "text-muted-foreground";
  if (score >= 60) return "text-under";
  if (score >= 40) return "text-fair";
  return "text-over";
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.sectors.length) params.set("sector", filters.sectors.join(","));
  if (filters.minUnder > 0) params.set("minUnder", String(filters.minUnder));
  if (filters.minPiotroski > 0) params.set("minPiotroski", String(filters.minPiotroski));
  if (filters.altmanZone) params.set("altmanZone", filters.altmanZone);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.q) params.set("q", filters.q);
  return params.toString();
}

export default function Screener() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    sectors: [],
    minUnder: 0,
    minPiotroski: 0,
    altmanZone: "",
    sort: "composite",
    q: "",
  });
  const [activePreset, setActivePreset] = useState(null);

  const fetchData = useCallback(async (nextFilters) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(nextFilters);
      const [metaRes, dataRes] = await Promise.all([
        fetch("/api/screener/meta"),
        fetch(`/api/screener${qs ? `?${qs}` : ""}`),
      ]);
      if (!metaRes.ok || !dataRes.ok) {
        const err = await dataRes.json().catch(() => ({}));
        throw new Error(err.error?.message || "Screener request failed");
      }
      setMeta(await metaRes.json());
      setData(await dataRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters);
  }, [filters, fetchData]);

  const sectors = data?.sectors ?? [];

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = filters.q.trim().toUpperCase();
    if (!q) return list;
    return list.filter((r) =>
      r.ticker.includes(q) || (r.name || "").toUpperCase().includes(q),
    );
  }, [data?.rows, filters.q]);

  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setFilters((prev) => ({
      ...prev,
      minUnder: preset.params.minUnder,
      minPiotroski: preset.params.minPiotroski,
      altmanZone: preset.params.altmanZone,
      sort: preset.params.sort,
    }));
  };

  const toggleSector = (sector, checked) => {
    setActivePreset(null);
    setFilters((prev) => {
      const next = new Set(prev.sectors);
      if (checked) next.add(sector);
      else next.delete(sector);
      return { ...prev, sectors: [...next] };
    });
  };

  const freshness = meta?.asOf || meta?.finishedAt?.slice(0, 10);
  const empty = !loading && (meta?.rowCount === 0 || !meta?.runId);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 pb-20">
        <div className="border-b border-border pt-6 pb-4 sm:pt-10">
          <AppNav subtitle="Discovery — rank the S&P 500 by strategy verdicts from the latest batch run." />

          <div className="rise mt-4 flex flex-wrap items-center gap-2" style={{ animationDelay: "80ms" }}>
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={activePreset === preset.id ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => applyPreset(preset)}
                title={preset.hint}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="rise mt-3 flex flex-wrap items-center gap-2" style={{ animationDelay: "120ms" }}>
            <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter tickers…"
                value={filters.q}
                onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                className="h-8 pl-8"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <FilterIcon className="size-3.5" />
                  Sector
                  {filters.sectors.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {filters.sectors.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>GICS sector</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sectors.map((sector) => (
                  <DropdownMenuCheckboxItem
                    key={sector}
                    checked={filters.sectors.includes(sector)}
                    onCheckedChange={(checked) => toggleSector(sector, checked === true)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {sector}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Min undervalued
              <Input
                type="number"
                min={0}
                max={12}
                value={filters.minUnder || ""}
                onChange={(e) => {
                  setActivePreset(null);
                  setFilters((prev) => ({ ...prev, minUnder: Number(e.target.value) || 0 }));
                }}
                className="h-8 w-14 px-2 text-center"
              />
            </label>

            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Min F-Score
              <Input
                type="number"
                min={0}
                max={9}
                value={filters.minPiotroski || ""}
                onChange={(e) => {
                  setActivePreset(null);
                  setFilters((prev) => ({ ...prev, minPiotroski: Number(e.target.value) || 0 }));
                }}
                className="h-8 w-14 px-2 text-center"
              />
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  Sort
                  <ArrowDownIcon className="size-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.id}
                    checked={filters.sort === opt.id}
                    onCheckedChange={() => {
                      setActivePreset(null);
                      setFilters((prev) => ({ ...prev, sort: opt.id }));
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className="rise mt-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            {loading && !meta ? (
              <Skeleton className="h-4 w-64" />
            ) : empty ? (
              <>
                No batch data yet. Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">npm run batch</code>{" "}
                locally, then commit <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">data/latest-run.json</code>.
              </>
            ) : (
              <>
                Data as of <span className="font-medium text-foreground">{freshness || "—"}</span>
                {" · "}
                {meta?.rowCount ?? 0} tickers
                {meta?.tickersFailed ? ` (${meta.tickersFailed} failed in last run)` : ""}
                {" · "}
                Balanced strategy set
                {data?.total != null && data.total !== rows.length
                  ? ` · showing ${rows.length} of ${data.total} matches`
                  : data?.total != null
                    ? ` · ${data.total} matches`
                    : ""}
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-over">{error}</p>
        )}

        <Card className="rise mt-4 overflow-hidden p-0" style={{ animationDelay: "200ms" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Sector</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Verdicts</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 text-right font-medium">F</th>
                  <th className="px-3 py-2 text-right font-medium">Z</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td colSpan={8} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No matches for the current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.ticker}
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/30"
                      onClick={() => navigate(`/?t=${encodeURIComponent(row.ticker)}`)}
                    >
                      <td className="px-3 py-2.5 font-mono font-medium tabular-nums">{row.ticker}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2.5 text-muted-foreground">{row.name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.sector || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.price != null ? fmt(row.price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {verdictSummary(row)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono font-medium tabular-nums", scoreTone(row.composite_score))}>
                        {row.composite_score ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.quality_piotroski ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.quality_altman != null ? fmt(row.quality_altman) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {loading && data && (
            <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              Updating…
            </div>
          )}
        </Card>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Row click opens live ticker analysis. Screener data is from the last local batch export — not real-time.
        </p>
      </div>
    </div>
  );
}
