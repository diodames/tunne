import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownIcon, ArrowUpIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, DownloadIcon, ExternalLinkIcon, FilterIcon, InfoIcon, SearchIcon, XIcon } from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KIND_META, SCORE_BANDS } from "../../lib/scoring.js";
import { fmt, fmtMarketCap, fmtPctOffHigh } from "../../lib/format.js";
import { downloadCsv, rowsToCsv } from "../../lib/screenerCsv.js";
import { loadWatchlist, toggleWatchlist } from "../../lib/watchlist.js";

const BALANCED_STRATEGY_COUNT = 11;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_COMPARE = 3;

const TABLE_COLSPAN = 15;

const MARKET_CAP_OPTIONS = [
  { id: "", label: "Any size" },
  { id: "large", label: "Large (≥ $10B)" },
  { id: "mid", label: "Mid ($2B–$10B)" },
  { id: "small", label: "Small (< $2B)" },
];

const ALTMAN_ZONE_OPTIONS = [
  { id: "any", label: "Any Altman" },
  { id: "safe", label: "Safe (Z > 3)" },
  { id: "grey", label: "Grey (1.8–3)" },
  { id: "distress", label: "Distress (Z < 1.8)" },
];

const SORT_LABELS = {
  composite: "Composite score",
  under: "Undervalued count",
  piotroski: "F-Score",
  altman: "Z-Score",
  price: "Price",
  market_cap: "Market cap",
  p_fcf: "P/FCF",
  week52_off: "Off 52w high",
};

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
    id: "safe_value",
    label: "Safe value",
    hint: "Cheap with Altman safe zone (Z > 3)",
    params: { minUnder: 4, minPiotroski: 0, altmanZone: "safe", sort: "composite" },
  },
  {
    id: "high_fscore",
    label: "High F-Score",
    hint: "Strongest Piotroski scores",
    params: { minUnder: 0, minPiotroski: 7, altmanZone: "", sort: "piotroski" },
  },
  {
    id: "contrarian",
    label: "Contrarian",
    hint: "Cheap but distressed",
    params: { minUnder: 5, minPiotroski: 0, altmanZone: "distress", sort: "under" },
  },
];

const CONTEXT_COLUMNS = [
  {
    id: "market_cap",
    label: "Mkt cap",
    tooltip: "Market capitalization at batch snapshot (click to sort)",
    render: (row) => fmtMarketCap(row.market_cap),
  },
  {
    id: "p_fcf",
    label: "P/FCF",
    tooltip: "Price to free cash flow — lower can mean cheaper on cash (click to sort)",
    render: (row) => fmt(row.p_fcf),
  },
  {
    id: "week52_off",
    label: "Off\u00A052w",
    tooltip: "Percent below 52-week high — higher may mean deeper pullback (click to sort)",
    render: (row) => fmtPctOffHigh(row.week52_off_pct),
  },
];

const SORTABLE_COLUMNS = [
  {
    id: "price",
    label: "Price",
    tooltip: "Batch snapshot price (click to sort, click again to reverse)",
  },
  {
    id: "under",
    label: "Under",
    tooltip: "Count of undervalued strategy verdicts (click to sort)",
  },
  {
    id: "composite",
    label: "Score",
    tooltip: "Composite score 0–100. Strong value ≥75 · Attractive ≥60 · Fair ≥40 · Expensive ≥25",
  },
  {
    id: "piotroski",
    label: "F\u2011Score",
    tooltip: "Piotroski F-Score (0–9). Higher = stronger financial quality",
  },
  {
    id: "altman",
    label: "Z\u2011Score",
    tooltip: "Altman Z-Score. Safe >3 · Grey 1.8–3 · Distress <1.8",
  },
];

const STICKY_TICKER =
  "max-md:sticky max-md:left-0 max-md:z-20 max-md:w-[4.5rem] max-md:min-w-[4.5rem] max-md:max-w-[4.5rem]";
const STICKY_NAME =
  "max-md:sticky max-md:left-[4.5rem] max-md:z-20 max-md:w-36 max-md:min-w-36 max-md:max-w-36 max-md:border-r max-md:border-border/50 max-md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]";
const STICKY_HEAD_BG = "max-md:bg-muted/40";
const STICKY_BODY_BG = "max-md:bg-card max-md:group-hover:bg-muted/30";

function ThresholdRow({ id, label, value, placeholder, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-7 w-14 text-center font-mono text-xs tabular-nums"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function hasActiveSignals(filters) {
  return filters.minUnder > 0
    || filters.maxOver > 0
    || filters.maxCaution > 0;
}

function hasActiveQualityFilters(filters) {
  return filters.minPiotroski > 0
    || Boolean(filters.altmanZone || filters.requireQuality);
}

function SortableTh({ sortKey, label, tooltip, activeSort, activeSortDir, onSort }) {
  const active = activeSort === sortKey;
  const SortIcon = active && activeSortDir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            className={cn(
              "inline-flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-foreground",
              active ? "text-foreground" : "text-muted-foreground",
            )}
            aria-sort={active ? (activeSortDir === "asc" ? "ascending" : "descending") : "none"}
          >
            {label}
            {active && <SortIcon className="size-3 shrink-0 opacity-70" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left normal-case">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function HeaderTip({ label, tooltip }) {
  return (
    <th className="px-3 py-2 font-medium">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default items-center gap-1 whitespace-nowrap uppercase tracking-wide">
            {label}
            <InfoIcon className="size-3 opacity-50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left normal-case">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function SectorFilterMenu({
  sectors,
  sectorCounts,
  selectedSectors,
  onToggleSector,
  onSelectAll,
  onClear,
  align = "start",
  children,
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-72 w-auto min-w-max overflow-y-auto">
        <DropdownMenuLabel>GICS sector</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onSelectAll();
          }}
        >
          Select all
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onClear();
          }}
        >
          Clear sectors
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sectors.map((sector) => (
          <DropdownMenuCheckboxItem
            key={sector}
            checked={selectedSectors.includes(sector)}
            onCheckedChange={(checked) => onToggleSector(sector, checked === true)}
            onSelect={(e) => e.preventDefault()}
            className="whitespace-nowrap"
          >
            {sector}
            {sectorCounts[sector] != null && (
              <span className="ml-auto pl-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                {sectorCounts[sector]}
              </span>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectorFilterTh({
  sectors,
  sectorCounts,
  selectedSectors,
  onToggleSector,
  onSelectAll,
  onClear,
}) {
  const active = selectedSectors.length > 0;
  return (
    <th className="px-3 py-2 font-medium">
      <SectorFilterMenu
        sectors={sectors}
        sectorCounts={sectorCounts}
        selectedSectors={selectedSectors}
        onToggleSector={onToggleSector}
        onSelectAll={onSelectAll}
        onClear={onClear}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
            active ? "text-foreground" : "text-muted-foreground",
          )}
          aria-label={active ? `Sector filter: ${selectedSectors.length} selected` : "Filter by sector"}
        >
          Sector
          <FilterIcon className="size-3 shrink-0 opacity-70" />
          {active ? (
            <span className="font-mono text-[10px] tabular-nums normal-case">{selectedSectors.length}</span>
          ) : null}
        </button>
      </SectorFilterMenu>
    </th>
  );
}

function MarketCapFilterMenu({ marketCap, onMarketCapChange, align = "start", children }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel>Market cap</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={marketCap || "any"}
          onValueChange={(value) => onMarketCapChange(value === "any" ? "" : value)}
        >
          {MARKET_CAP_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id || "any"} value={option.id || "any"}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarketCapFilterSortTh({
  label,
  tooltip,
  marketCap,
  onMarketCapChange,
  activeSort,
  activeSortDir,
  onSort,
}) {
  const filterActive = Boolean(marketCap);
  const sortActive = activeSort === "market_cap";
  const SortIcon = sortActive && activeSortDir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  const activeCapLabel = MARKET_CAP_OPTIONS.find((c) => c.id === marketCap)?.label;

  return (
    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onSort("market_cap")}
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-foreground",
                sortActive ? "text-foreground" : "text-muted-foreground",
              )}
              aria-sort={sortActive ? (activeSortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              {label}
              {sortActive && <SortIcon className="size-3 shrink-0 opacity-70" />}
            </button>
            <MarketCapFilterMenu
              marketCap={marketCap}
              onMarketCapChange={onMarketCapChange}
              align="end"
            >
              <button
                type="button"
                className={cn(
                  "rounded p-0.5 transition-colors hover:text-foreground",
                  filterActive ? "text-foreground" : "text-muted-foreground/70",
                )}
                aria-label={filterActive ? `Market cap filter: ${activeCapLabel}` : "Filter by market cap"}
              >
                <FilterIcon className="size-3 shrink-0" />
              </button>
            </MarketCapFilterMenu>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left normal-case">
          {tooltip}
          {filterActive ? ` · Filter: ${activeCapLabel}` : ""}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function VerdictChips({ row }) {
  const items = [
    { count: row.undervalued_count, kind: "under", suffix: "U" },
    { count: row.fair_count, kind: "fair", suffix: "F" },
    { count: row.overvalued_count, kind: "over", suffix: "O" },
    { count: row.caution_count, kind: "caution", suffix: "C" },
  ].filter((item) => item.count > 0);

  if (!items.length) return <span className="text-muted-foreground">—</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item.suffix}
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10px] font-medium tabular-nums ring-1 ring-inset",
                KIND_META[item.kind].text,
                KIND_META[item.kind].halo,
                item.kind === "under" && "ring-under/25",
                item.kind === "fair" && "ring-fair/25",
                (item.kind === "over" || item.kind === "caution") && "ring-over/25",
              )}
            >
              {item.count}
              {item.suffix}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent className="normal-case">
        {items.map((item) => `${item.count} ${KIND_META[item.kind].label.toLowerCase()}`).join(" · ")}
        {" · "}
        {BALANCED_STRATEGY_COUNT} balanced strategies
      </TooltipContent>
    </Tooltip>
  );
}

function QualityCell({ value, label, format }) {
  if (value == null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block min-w-4 border-b border-dashed border-muted-foreground/50 text-muted-foreground/50">
            —
          </span>
        </TooltipTrigger>
        <TooltipContent className="normal-case">{label} unavailable in batch run</TooltipContent>
      </Tooltip>
    );
  }
  return <>{format ? format(value) : value}</>;
}

function ScreenerMobileCard({
  row,
  rank,
  isSelected,
  isSaved,
  onOpen,
  onToggleSelected,
  onToggleSaved,
  onOpenNewTab,
}) {
  const sym = row.ticker.toUpperCase();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(sym)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(sym);
        }
      }}
      className={cn(
        "cursor-pointer p-4 transition-colors hover:bg-muted/30",
        isSelected && "bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">#{rank}</span>
            <span className="font-mono font-medium tabular-nums">{sym}</span>
            <span className={cn("font-mono text-sm font-medium tabular-nums", scoreTone(row.composite_score))}>
              {row.composite_score ?? "—"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{row.name}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{row.sector || "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => onToggleSelected(sym, e)}
            aria-label={isSelected ? `Remove ${sym} from compare` : `Add ${sym} to compare`}
            aria-pressed={isSelected}
            className={cn(
              "flex size-5 items-center justify-center rounded border transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-transparent",
            )}
          >
            <CheckIcon className="size-3" />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn("text-muted-foreground", isSaved && "text-primary")}
            aria-label={isSaved ? `Remove ${sym} from saved` : `Save ${sym}`}
            onClick={(e) => onToggleSaved(sym, e)}
          >
            <BookmarkIcon className={cn("size-3.5", isSaved && "fill-current")} />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <VerdictChips row={row} />
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono tabular-nums">{row.price != null ? fmt(row.price) : "—"}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono tabular-nums">{fmtMarketCap(row.market_cap)}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono tabular-nums">P/FCF {fmt(row.p_fcf)}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono tabular-nums">{fmtPctOffHigh(row.week52_off_pct)} off high</span>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onOpenNewTab(sym);
          }}
        >
          Open in new tab
          <ExternalLinkIcon className="ml-1 size-3" />
        </Button>
      </div>
    </div>
  );
}

function defaultFilters() {
  return {
    sectors: [],
    minUnder: 0,
    minPiotroski: 0,
    maxOver: 0,
    maxCaution: 0,
    altmanZone: "",
    sort: "composite",
    sortDir: "desc",
    requireQuality: false,
    marketCap: "",
    q: "",
    limit: DEFAULT_LIMIT,
    offset: 0,
  };
}

function filtersFromSearchParams(params) {
  const sectors = (params.get("sector") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxOverRaw = params.get("maxOver");
  const maxCautionRaw = params.get("maxCaution");

  return {
    sectors,
    minUnder: Number(params.get("minUnder") || 0),
    minPiotroski: Number(params.get("minPiotroski") || 0),
    maxOver: Number(maxOverRaw || 0),
    maxCaution: Number(maxCautionRaw || 0),
    altmanZone: params.get("altmanZone") || "",
    sort: params.get("sort") || "composite",
    sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
    requireQuality: params.get("requireQuality") === "1",
    marketCap: ["large", "mid", "small"].includes(params.get("marketCap") || "")
      ? params.get("marketCap")
      : "",
    q: params.get("q") || "",
    limit: Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") || DEFAULT_LIMIT))),
    offset: Math.max(0, Number(params.get("offset") || 0)),
  };
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.sectors.length) params.set("sector", filters.sectors.join(","));
  if (filters.minUnder > 0) params.set("minUnder", String(filters.minUnder));
  if (filters.minPiotroski > 0) params.set("minPiotroski", String(filters.minPiotroski));
  if (filters.maxOver > 0) params.set("maxOver", String(filters.maxOver));
  if (filters.maxCaution > 0) params.set("maxCaution", String(filters.maxCaution));
  if (filters.altmanZone) params.set("altmanZone", filters.altmanZone);
  if (filters.requireQuality) params.set("requireQuality", "1");
  if (filters.marketCap) params.set("marketCap", filters.marketCap);
  if (filters.sort && filters.sort !== "composite") params.set("sort", filters.sort);
  if (filters.sortDir === "asc") params.set("sortDir", "asc");
  if (filters.q) params.set("q", filters.q);
  params.set("limit", String(filters.limit ?? DEFAULT_LIMIT));
  return params.toString();
}

function detectActivePreset(filters) {
  return PRESETS.find(
    (p) =>
      p.params.minUnder === filters.minUnder
      && p.params.minPiotroski === filters.minPiotroski
      && p.params.altmanZone === filters.altmanZone
      && p.params.sort === filters.sort
      && filters.sortDir === "desc"
      && !filters.requireQuality
      && !filters.marketCap
      && filters.maxOver === 0
      && filters.maxCaution === 0
      && filters.sectors.length === 0
      && !filters.q,
  )?.id ?? null;
}

function emptyStateHint(filters) {
  const hints = [];
  if (filters.minUnder > 4) hints.push(`lower Undervalued ≥${filters.minUnder} to ≥${filters.minUnder - 2}`);
  if (filters.minPiotroski > 4) hints.push(`lower F-Score ≥${filters.minPiotroski}`);
  if (filters.sectors.length) hints.push("clear sector filters");
  if (filters.altmanZone) hints.push("set Altman to Any");
  if (filters.maxOver > 0) hints.push(`raise Overvalued ≤${filters.maxOver} or reset to 0`);
  if (filters.maxCaution > 0) hints.push(`raise Caution ≤${filters.maxCaution} or reset to 0`);
  if (filters.requireQuality) hints.push("turn off Complete F & Z");
  if (filters.marketCap) hints.push("clear market cap filter");
  if (filters.q) hints.push("clear ticker search");
  return hints[0] || "clear all filters";
}

function scoreTone(score) {
  if (score == null) return "text-muted-foreground";
  if (score >= 60) return "text-under";
  if (score >= 40) return "text-fair";
  return "text-over";
}

function scoreBandLabel(score) {
  if (score == null) return null;
  return SCORE_BANDS.find((b) => score >= b.min)?.label ?? null;
}

export default function Screener() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [activePreset, setActivePreset] = useState(() => detectActivePreset(filtersFromSearchParams(searchParams)));
  const [selected, setSelected] = useState([]);
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());

  const updateFilters = useCallback((updater) => {
    setFilters((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      setActivePreset(detectActivePreset(next));
      return next;
    });
  }, []);

  useEffect(() => {
    setSearchParams(buildQuery(filters), { replace: true });
  }, [filters, setSearchParams]);

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
  const sectorCounts = data?.sectorCounts ?? {};
  const rows = data?.rows ?? [];
  const visibleCount = rows.length;
  const totalMatches = data?.total ?? 0;
  const cappedByLimit = totalMatches > visibleCount;
  const newMatches = data?.newMatches ?? [];
  const previousAsOf = data?.previousAsOf;

  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    setFilters((prev) => ({
      ...prev,
      minUnder: preset.params.minUnder,
      minPiotroski: preset.params.minPiotroski,
      altmanZone: preset.params.altmanZone,
      sort: preset.params.sort,
      sortDir: "desc",
      requireQuality: false,
      marketCap: "",
      maxOver: 0,
      maxCaution: 0,
      sectors: [],
      q: "",
    }));
  };

  const toggleSector = (sector, checked) => {
    updateFilters((prev) => {
      const next = new Set(prev.sectors);
      if (checked) next.add(sector);
      else next.delete(sector);
      return { ...prev, sectors: [...next] };
    });
  };

  const setSort = (sortKey) => {
    updateFilters((prev) => {
      if (prev.sort === sortKey) {
        return { ...prev, sortDir: prev.sortDir === "desc" ? "asc" : "desc" };
      }
      return { ...prev, sort: sortKey, sortDir: "desc" };
    });
  };

  const selectAllSectors = () => {
    updateFilters((prev) => ({ ...prev, sectors: [...sectors] }));
  };

  const clearSectors = () => {
    updateFilters((prev) => ({ ...prev, sectors: [] }));
  };

  const toggleSelected = (ticker, e) => {
    e.stopPropagation();
    const sym = ticker.toUpperCase();
    setSelected((prev) => {
      if (prev.includes(sym)) return prev.filter((t) => t !== sym);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, sym];
    });
  };

  const toggleSaved = (ticker, e) => {
    e.stopPropagation();
    setWatchlist(toggleWatchlist(ticker));
  };

  const openAnalysis = (ticker, newTab = false) => {
    const url = `/?t=${encodeURIComponent(ticker)}&from=screener`;
    if (newTab) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(url);
  };

  const exportCsv = () => {
    const exportRows = selected.length > 0
      ? rows.filter((row) => selected.includes(row.ticker.toUpperCase()))
      : rows;
    if (!exportRows.length) return;
    const stamp = meta?.asOf || new Date().toISOString().slice(0, 10);
    const suffix = selected.length > 0 ? "-selected" : "";
    downloadCsv(`screener-${stamp}${suffix}.csv`, rowsToCsv(exportRows));
  };

  const clearAllFilters = () => {
    setActivePreset(null);
    setFilters(defaultFilters());
  };

  const filterChips = useMemo(() => {
    const chips = [];
    if (activePreset) {
      const preset = PRESETS.find((p) => p.id === activePreset);
      if (preset) {
        chips.push({
          key: "preset",
          label: preset.label,
          clear: clearAllFilters,
        });
      }
    }
    if (filters.q) chips.push({ key: "q", label: `Search: ${filters.q}`, clear: () => updateFilters((p) => ({ ...p, q: "" })) });
    for (const sector of filters.sectors) {
      chips.push({
        key: `sector-${sector}`,
        label: sector,
        clear: () => toggleSector(sector, false),
      });
    }
    if (filters.minUnder > 0) {
      chips.push({
        key: "minUnder",
        label: `Undervalued ≥${filters.minUnder}`,
        clear: () => updateFilters((p) => ({ ...p, minUnder: 0 })),
      });
    }
    if (filters.minPiotroski > 0) {
      chips.push({
        key: "minPiotroski",
        label: `F-Score ≥${filters.minPiotroski}`,
        clear: () => updateFilters((p) => ({ ...p, minPiotroski: 0 })),
      });
    }
    if (filters.maxOver > 0) {
      chips.push({
        key: "maxOver",
        label: `Overvalued ≤${filters.maxOver}`,
        clear: () => updateFilters((p) => ({ ...p, maxOver: 0 })),
      });
    }
    if (filters.maxCaution > 0) {
      chips.push({
        key: "maxCaution",
        label: `Caution ≤${filters.maxCaution}`,
        clear: () => updateFilters((p) => ({ ...p, maxCaution: 0 })),
      });
    }
    if (filters.altmanZone) {
      const zone = ALTMAN_ZONE_OPTIONS.find((z) => z.id === filters.altmanZone);
      chips.push({
        key: "altmanZone",
        label: zone?.label ?? filters.altmanZone,
        clear: () => updateFilters((p) => ({ ...p, altmanZone: "" })),
      });
    }
    if (filters.requireQuality) {
      chips.push({
        key: "requireQuality",
        label: "Complete F & Z",
        clear: () => updateFilters((p) => ({ ...p, requireQuality: false })),
      });
    }
    if (filters.marketCap) {
      const cap = MARKET_CAP_OPTIONS.find((c) => c.id === filters.marketCap);
      chips.push({
        key: "marketCap",
        label: cap?.label ?? filters.marketCap,
        clear: () => updateFilters((p) => ({ ...p, marketCap: "" })),
      });
    }
    return chips;
  }, [filters, activePreset, updateFilters]);

  const freshness = meta?.asOf || meta?.finishedAt?.slice(0, 10);
  const empty = !loading && (meta?.rowCount === 0 || !meta?.runId);
  const activePresetMeta = PRESETS.find((p) => p.id === activePreset);
  const hasRefineFilters = filterChips.length > 0;
  const sortLabel = SORT_LABELS[filters.sort] ?? filters.sort;
  const sortDirLabel = filters.sortDir === "asc" ? "↑" : "↓";

  const statusLine = loading && !meta ? (
    <Skeleton className="h-4 w-64" />
  ) : empty ? (
    <>
      No batch data yet. Run{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">npm run batch</code>{" "}
      locally, then commit <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">data/latest-run.json</code>.
    </>
  ) : (
    <>
      Data as of{" "}
      <span className="font-medium text-foreground">{freshness || "—"}</span>
      <span className="text-muted-foreground/50"> · </span>
      <span className="font-mono tabular-nums">{meta?.rowCount ?? 0}</span> in batch
      <span className="text-muted-foreground/50"> · </span>
      {totalMatches > 0 ? (
        <>
          <span className="font-mono tabular-nums text-foreground">{visibleCount}</span> shown of{" "}
          <span className="font-mono tabular-nums text-foreground">{totalMatches}</span> matches
          <span className="text-muted-foreground/50"> · </span>
          sorted by {sortLabel} {sortDirLabel}
          {cappedByLimit && filters.limit < MAX_LIMIT && (
            <>
              <span className="text-muted-foreground/50"> · </span>
              <button
                type="button"
                onClick={() => updateFilters((prev) => ({ ...prev, limit: MAX_LIMIT }))}
                className="text-foreground underline-offset-2 hover:underline"
              >
                Show all {Math.min(totalMatches, MAX_LIMIT)}
              </button>
            </>
          )}
          {newMatches.length > 0 && (
            <>
              <span className="text-muted-foreground/50"> · </span>
              <span className="font-mono tabular-nums text-foreground">{newMatches.length}</span>
              {" new since "}
              {previousAsOf || "last run"}
            </>
          )}
        </>
      ) : (
        "No matches"
      )}
    </>
  );

  return (
    <TooltipProvider>
    <div className="min-h-screen">
      <div className={cn("mx-auto max-w-6xl px-5 pb-20", selected.length > 0 && "pb-28")}>
        <div className="pt-6 pb-5 sm:pt-10 sm:pb-6">
          <AppNav
            title="Screener"
            backTo="/"
            subtitle={statusLine}
            subtitleClassName="text-[11px]"
          />

          <div
            className="rise mt-4 flex flex-wrap items-center justify-between gap-2"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative w-full min-w-[10rem] max-w-xs shrink-0">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search ticker…"
                  value={filters.q}
                  onChange={(e) => updateFilters((prev) => ({ ...prev, q: e.target.value }))}
                  className="h-8 pl-8"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 shrink-0 gap-1 font-normal",
                      activePreset && "border-primary/40 bg-primary/5",
                    )}
                  >
                    {activePresetMeta?.label ?? "Strategy"}
                    <ChevronDownIcon className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Strategy presets</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={activePreset || "none"}
                    onValueChange={(id) => {
                      if (id === "none") {
                        clearAllFilters();
                        return;
                      }
                      const preset = PRESETS.find((p) => p.id === id);
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                    {PRESETS.map((preset) => (
                      <DropdownMenuRadioItem key={preset.id} value={preset.id} title={preset.hint}>
                        {preset.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 shrink-0 gap-1 font-normal",
                      hasActiveSignals(filters) && "border-primary/40 bg-primary/5",
                    )}
                  >
                    Signals
                    <ChevronDownIcon className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-3" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <p className="mb-3 text-xs font-medium">Strategy signal counts</p>
                  <div className="flex flex-col gap-2.5">
                    <ThresholdRow
                      id="screener-min-under"
                      label="Undervalued ≥"
                      min={0}
                      max={12}
                      placeholder="0"
                      value={filters.minUnder}
                      onChange={(e) => {
                        updateFilters((prev) => ({ ...prev, minUnder: Number(e.target.value) || 0 }));
                      }}
                    />
                    <ThresholdRow
                      id="screener-max-over"
                      label="Overvalued ≤"
                      min={0}
                      max={12}
                      placeholder="0"
                      value={filters.maxOver}
                      onChange={(e) => {
                        updateFilters((prev) => ({
                          ...prev,
                          maxOver: Number(e.target.value) || 0,
                        }));
                      }}
                    />
                    <ThresholdRow
                      id="screener-max-caution"
                      label="Caution ≤"
                      min={0}
                      max={12}
                      placeholder="0"
                      value={filters.maxCaution}
                      onChange={(e) => {
                        updateFilters((prev) => ({
                          ...prev,
                          maxCaution: Number(e.target.value) || 0,
                        }));
                      }}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 shrink-0 gap-1 font-normal",
                      hasActiveQualityFilters(filters) && "border-primary/40 bg-primary/5",
                    )}
                  >
                    Quality
                    <ChevronDownIcon className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <div className="p-3 pb-2">
                    <p className="mb-2 text-xs font-medium">F-Score</p>
                    <ThresholdRow
                      id="screener-min-fscore"
                      label="Minimum ≥"
                      min={0}
                      max={9}
                      placeholder="0"
                      value={filters.minPiotroski}
                      onChange={(e) => {
                        updateFilters((prev) => ({ ...prev, minPiotroski: Number(e.target.value) || 0 }));
                      }}
                    />
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Altman Z zone</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filters.altmanZone || "any"}
                    onValueChange={(value) =>
                      updateFilters((prev) => ({ ...prev, altmanZone: value === "any" ? "" : value }))
                    }
                  >
                    {ALTMAN_ZONE_OPTIONS.map((zone) => (
                      <DropdownMenuRadioItem key={zone.id} value={zone.id}>
                        {zone.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={filters.requireQuality}
                    onCheckedChange={(checked) =>
                      updateFilters((prev) => ({ ...prev, requireQuality: checked === true }))
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    Complete F & Z
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {hasRefineFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                  onClick={clearAllFilters}
                >
                  Clear all
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!rows.length}
              onClick={exportCsv}
            >
              <DownloadIcon className="size-3.5" />
              Export CSV
              {selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
          </div>

          {filterChips.length > 0 && (
            <div className="rise mt-3 flex flex-wrap items-center gap-1.5" style={{ animationDelay: "140ms" }}>
              {filterChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="h-6 gap-1 pr-1 pl-2 text-[11px] font-normal"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.clear}
                    className="rounded-sm p-0.5 hover:bg-muted"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

        </div>

        {error && (
          <p className="mt-4 text-sm text-over">{error}</p>
        )}

        <Card className="rise mt-4 overflow-hidden p-0" style={{ animationDelay: "200ms" }}>
          <div className="md:hidden">
            {loading && !data ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border-b border-border/60 p-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-muted-foreground">
                <p>No matches for the current filters.</p>
                <p className="mt-1 text-xs">
                  Try to {emptyStateHint(filters)}, or{" "}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    clear all filters
                  </button>
                  .
                </p>
              </div>
            ) : (
              rows.map((row, index) => {
                const sym = row.ticker.toUpperCase();
                return (
                  <ScreenerMobileCard
                    key={row.ticker}
                    row={row}
                    rank={(filters.offset ?? 0) + index + 1}
                    isSelected={selected.includes(sym)}
                    isSaved={watchlist.includes(sym)}
                    onOpen={openAnalysis}
                    onToggleSelected={toggleSelected}
                    onToggleSaved={toggleSaved}
                    onOpenNewTab={(ticker) => openAnalysis(ticker, true)}
                  />
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border bg-muted/40 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="w-10 px-2 py-2 font-medium" aria-label="Compare selection" />
                  <th className="w-10 px-2 py-2 text-right font-medium">#</th>
                  <th className={cn("px-3 py-2 font-medium", STICKY_TICKER, STICKY_HEAD_BG)}>Ticker</th>
                  <th className={cn("px-3 py-2 font-medium", STICKY_NAME, STICKY_HEAD_BG)}>Name</th>
                  <SectorFilterTh
                    sectors={sectors}
                    sectorCounts={sectorCounts}
                    selectedSectors={filters.sectors}
                    onToggleSector={toggleSector}
                    onSelectAll={selectAllSectors}
                    onClear={clearSectors}
                  />
                  {CONTEXT_COLUMNS.map((col) =>
                    col.id === "market_cap" ? (
                      <MarketCapFilterSortTh
                        key={col.id}
                        label={col.label}
                        tooltip={col.tooltip}
                        marketCap={filters.marketCap}
                        onMarketCapChange={(value) => updateFilters((prev) => ({ ...prev, marketCap: value }))}
                        activeSort={filters.sort}
                        activeSortDir={filters.sortDir}
                        onSort={setSort}
                      />
                    ) : (
                      <SortableTh
                        key={col.id}
                        sortKey={col.id}
                        label={col.label}
                        tooltip={col.tooltip}
                        activeSort={filters.sort}
                        activeSortDir={filters.sortDir}
                        onSort={setSort}
                      />
                    ),
                  )}
                  <HeaderTip
                    label="Signals"
                    tooltip={`Color-coded under / fair / over / caution counts from ${BALANCED_STRATEGY_COUNT} balanced strategies`}
                  />
                  {SORTABLE_COLUMNS.map((col) => (
                    <SortableTh
                      key={col.id}
                      sortKey={col.id}
                      label={col.label}
                      tooltip={col.tooltip}
                      activeSort={filters.sort}
                      activeSortDir={filters.sortDir}
                      onSort={setSort}
                    />
                  ))}
                  <th className="w-10 px-2 py-2 font-medium" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td colSpan={TABLE_COLSPAN} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLSPAN} className="px-3 py-8 text-center text-muted-foreground">
                      <p>No matches for the current filters.</p>
                      <p className="mt-1 text-xs">
                        Try to {emptyStateHint(filters)}, or{" "}
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          clear all filters
                        </button>
                        .
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => {
                    const sym = row.ticker.toUpperCase();
                    const isSelected = selected.includes(sym);
                    const isSaved = watchlist.includes(sym);

                    return (
                    <tr
                      key={row.ticker}
                      className={cn(
                        "group cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/30",
                        isSelected && "bg-primary/5",
                      )}
                      onClick={() => openAnalysis(row.ticker)}
                    >
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => toggleSelected(sym, e)}
                          aria-label={isSelected ? `Remove ${sym} from compare` : `Add ${sym} to compare`}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex size-5 items-center justify-center rounded border transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent hover:border-muted-foreground/40",
                          )}
                        >
                          <CheckIcon className="size-3" />
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {(filters.offset ?? 0) + index + 1}
                      </td>
                      <td className={cn("px-3 py-2.5 font-mono font-medium tabular-nums", STICKY_TICKER, STICKY_BODY_BG)}>
                        {row.ticker}
                      </td>
                      <td className={cn("max-w-[12rem] truncate px-3 py-2.5 text-muted-foreground", STICKY_NAME, STICKY_BODY_BG)}>
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.sector || "—"}</td>
                      {CONTEXT_COLUMNS.map((col) => (
                        <td key={col.id} className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {col.render(row)}
                        </td>
                      ))}
                      <td className="px-3 py-2.5">
                        <VerdictChips row={row} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {row.price != null ? fmt(row.price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {row.undervalued_count ?? 0}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono font-medium tabular-nums", scoreTone(row.composite_score))}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{row.composite_score ?? "—"}</span>
                          </TooltipTrigger>
                          {row.composite_score != null && (
                            <TooltipContent className="normal-case">
                              {scoreBandLabel(row.composite_score)} · composite 0–100
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <QualityCell value={row.quality_piotroski} label="F-Score" />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <QualityCell
                          value={row.quality_altman}
                          label="Z-Score"
                          format={fmt}
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className={cn("text-muted-foreground", isSaved && "text-primary")}
                            aria-label={isSaved ? `Remove ${sym} from saved` : `Save ${sym}`}
                            onClick={(e) => toggleSaved(sym, e)}
                          >
                            <BookmarkIcon className={cn("size-3.5", isSaved && "fill-current")} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground"
                            aria-label={`Open ${sym} analysis in new tab`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openAnalysis(sym, true);
                            }}
                          >
                            <ExternalLinkIcon className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
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
          Row click opens live analysis. Bookmark saves to your home watchlist. Select up to {MAX_COMPARE} tickers to compare side-by-side. Batch data is from the last export — not real-time.
        </p>
      </div>

      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-xl">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {selected.length}/{MAX_COMPARE} selected
          </span>
          <Button
            size="sm"
            className="h-8"
            disabled={selected.length < 2}
            onClick={() => openAnalysis(selected.join(","))}
          >
            Compare {selected.length > 1 ? `${selected.length} tickers` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => openAnalysis(selected[0], true)}
          >
            Open first
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => setSelected([])}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
