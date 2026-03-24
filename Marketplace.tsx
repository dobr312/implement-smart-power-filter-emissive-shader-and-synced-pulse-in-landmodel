import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Search,
  ShoppingCart,
  Store,
  User,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { LandData, ModifierInstance } from "../backend.d";
import { PLANNED_MODIFIER_CATALOG } from "../data/modifierCatalog";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import {
  ItemType,
  useBuyItem,
  useCancelListing,
  useGetAllActiveListings,
  useGetLandData,
  useGetModifierInventory,
  useGetPublicLandDataBatch,
  useListItem,
} from "../hooks/useQueries";

// ─────────────────────────────────────────────
// CONSTANTS & TYPES
// ─────────────────────────────────────────────

const BIOME_COLORS: Record<string, string> = {
  MYTHIC_VOID: "#cc00ff",
  MYTHIC_AETHER: "#0088ff",
  VOLCANIC_CRAG: "#ff2200",
  DESERT_DUNE: "#ffaa00",
  FOREST_VALLEY: "#00ff44",
  SNOW_PEAK: "#88ddff",
  ISLAND_ARCHIPELAGO: "#00ffcc",
};

const BIOME_DISPLAY: Record<string, string> = {
  MYTHIC_VOID: "MYTHIC VOID",
  MYTHIC_AETHER: "MYTHIC AETHER",
  VOLCANIC_CRAG: "VOLCANIC CRAG",
  DESERT_DUNE: "DESERT DUNE",
  FOREST_VALLEY: "FOREST VALLEY",
  SNOW_PEAK: "SNOW PEAK",
  ISLAND_ARCHIPELAGO: "ISLAND ARCHIPELAGO",
};

const BIOME_KEYS = Object.keys(BIOME_COLORS);

const RARITY_META: Record<
  number,
  { label: string; color: string; glow: string; textClass: string }
> = {
  1: {
    label: "COMMON",
    color: "#9ca3af",
    glow: "rgba(156,163,175,0.4)",
    textClass: "text-gray-400",
  },
  2: {
    label: "RARE",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.6)",
    textClass: "text-blue-400",
  },
  3: {
    label: "LEGENDARY",
    color: "#a855f7",
    glow: "rgba(168,85,247,0.7)",
    textClass: "text-purple-400",
  },
  4: {
    label: "MYTHIC",
    color: "#facc15",
    glow: "rgba(250,204,21,0.9)",
    textClass: "text-yellow-400",
  },
};

interface ListingItem {
  listingId: bigint;
  itemId: bigint;
  itemType: ItemType;
  seller: { toString(): string };
  price: bigint;
  isActive: boolean;
}

interface FilterState {
  biomes: Set<string>;
  rarities: Set<number>;
  minPrice: number;
  maxPrice: number;
  search: string;
}

// ─────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────

function parseCBRPrice(input: string): bigint {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed || Number.isNaN(Number(trimmed))) return BigInt(0);
  const parts = trimmed.split(".");
  const whole = BigInt(parts[0] || "0");
  const decimalsStr = (parts[1] || "").padEnd(8, "0").slice(0, 8);
  const decimals = BigInt(decimalsStr);
  return whole * BigInt(100000000) + decimals;
}

function formatCBRDisplay(priceRaw: bigint): string {
  const n = Number(priceRaw) / 100000000;
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function truncatePrincipal(p: string): string {
  if (p.length <= 14) return p;
  return `${p.slice(0, 6)}...${p.slice(-5)}`;
}

function getModCatalog(modifierType: string) {
  return PLANNED_MODIFIER_CATALOG.find((m) => m.name === modifierType);
}

function getCatalogById(id: number) {
  return PLANNED_MODIFIER_CATALOG.find((m) => m.id === id);
}

function getBiomeColor(biome: string): string {
  return BIOME_COLORS[biome] ?? "#00ffcc";
}

function getRarityMeta(tier: number | bigint) {
  const t = Number(tier);
  return RARITY_META[t] ?? RARITY_META[1];
}

// ─────────────────────────────────────────────
// FILTER DRAWER
// ─────────────────────────────────────────────

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
}

function FilterDrawer({
  open,
  onClose,
  filters,
  onFiltersChange,
}: FilterDrawerProps) {
  const toggleBiome = useCallback(
    (biome: string) => {
      const next = new Set(filters.biomes);
      if (next.has(biome)) next.delete(biome);
      else next.add(biome);
      onFiltersChange({ ...filters, biomes: next });
    },
    [filters, onFiltersChange],
  );

  const toggleRarity = useCallback(
    (r: number) => {
      const next = new Set(filters.rarities);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      onFiltersChange({ ...filters, rarities: next });
    },
    [filters, onFiltersChange],
  );

  const resetAll = useCallback(() => {
    onFiltersChange({
      biomes: new Set(),
      rarities: new Set(),
      minPrice: 0,
      maxPrice: 10000,
      search: "",
    });
  }, [onFiltersChange]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="left"
        className="w-[280px] p-0 border-r border-white/10"
        style={{
          background:
            "linear-gradient(135deg, rgba(8,0,28,0.97) 0%, rgba(20,0,50,0.95) 100%)",
          backdropFilter: "blur(20px)",
        }}
        data-ocid="marketplace.sheet"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <span className="font-orbitron text-white font-bold text-sm tracking-widest">
              FILTERS
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAll}
                className="font-jetbrains text-xs text-white/40 hover:text-white/70 transition-colors"
                data-ocid="marketplace.filter.button"
              >
                RESET ALL
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* Biome filter */}
            <div>
              <div className="font-jetbrains text-xs text-white/30 tracking-widest mb-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-white/10" />
                BIOME
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="space-y-2">
                {BIOME_KEYS.map((biome) => {
                  const color = BIOME_COLORS[biome];
                  const checked = filters.biomes.has(biome);
                  return (
                    <label
                      key={biome}
                      htmlFor={`${biome}-check`}
                      className="flex items-center gap-3 cursor-pointer group"
                      data-ocid="marketplace.filter.checkbox"
                    >
                      <Checkbox
                        id={`${biome}-check`}
                        checked={checked}
                        onCheckedChange={() => toggleBiome(biome)}
                        className="border-white/20 data-[state=checked]:bg-transparent"
                        style={
                          checked
                            ? {
                                borderColor: color,
                                boxShadow: `0 0 8px ${color}80`,
                              }
                            : {}
                        }
                      />
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          background: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                      <span className="font-jetbrains text-xs text-white/60 group-hover:text-white/90 transition-colors">
                        {BIOME_DISPLAY[biome]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Rarity filter */}
            <div>
              <div className="font-jetbrains text-xs text-white/30 tracking-widest mb-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-white/10" />
                RARITY
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="space-y-2">
                {([1, 2, 3, 4] as const).map((tier) => {
                  const meta = RARITY_META[tier];
                  const checked = filters.rarities.has(tier);
                  return (
                    <label
                      key={tier}
                      htmlFor={`rarity-${tier}`}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <Checkbox
                        id={`rarity-${tier}`}
                        checked={checked}
                        onCheckedChange={() => toggleRarity(tier)}
                        className="border-white/20"
                        style={
                          checked
                            ? {
                                borderColor: meta.color,
                                boxShadow: `0 0 8px ${meta.glow}`,
                              }
                            : {}
                        }
                      />
                      <span
                        className={`font-jetbrains text-xs ${meta.textClass} group-hover:opacity-90 transition-opacity`}
                      >
                        {meta.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Price slider */}
            <div>
              <div className="font-jetbrains text-xs text-white/30 tracking-widest mb-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-white/10" />
                PRICE
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-jetbrains text-xs text-white/40">
                      MIN
                    </span>
                    <span
                      className="font-jetbrains text-xs"
                      style={{ color: "#FAD26A" }}
                    >
                      {filters.minPrice} CBR
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={10000}
                    step={10}
                    value={[filters.minPrice]}
                    onValueChange={([v]) =>
                      onFiltersChange({ ...filters, minPrice: v })
                    }
                    className="[&_[role=slider]]:border-yellow-400 [&_[role=slider]]:bg-yellow-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="font-jetbrains text-xs text-white/40">
                      MAX
                    </span>
                    <span
                      className="font-jetbrains text-xs"
                      style={{ color: "#FAD26A" }}
                    >
                      {filters.maxPrice} CBR
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={10000}
                    step={10}
                    value={[filters.maxPrice]}
                    onValueChange={([v]) =>
                      onFiltersChange({ ...filters, maxPrice: v })
                    }
                    className="[&_[role=slider]]:border-yellow-400 [&_[role=slider]]:bg-yellow-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
// INSPECTOR MODAL (7x7)
// ─────────────────────────────────────────────

interface InspectorModalProps {
  open: boolean;
  onClose: () => void;
  listing: ListingItem;
  landData?: LandData;
}

function InspectorModal({
  open,
  onClose,
  listing,
  landData,
}: InspectorModalProps) {
  const biome = landData?.biome ?? "";
  const biomeColor = getBiomeColor(biome);
  const displayBiome = BIOME_DISPLAY[biome] ?? "CYBER LAND";
  const sellerStr = listing.seller.toString();
  const mods = landData?.attachedModifications ?? [];
  const installed = mods.length;
  const free = 49 - installed;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl w-full p-0 border-0 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(5,0,20,0.98) 0%, rgba(15,0,40,0.97) 100%)",
          backdropFilter: "blur(24px)",
          border: `1px solid ${biomeColor}30`,
          boxShadow: `0 0 40px ${biomeColor}20, 0 0 80px ${biomeColor}10`,
        }}
        data-ocid="marketplace.dialog"
      >
        {/* Close btn */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
          data-ocid="marketplace.close_button"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          {/* Header text */}
          <div className="mb-6">
            <h2
              className="font-orbitron font-bold text-2xl mb-1"
              style={{
                color: biome ? biomeColor : "#ffffff",
                textShadow: biome ? `0 0 16px ${biomeColor}80` : "none",
              }}
            >
              {displayBiome}
            </h2>
            <p className="font-jetbrains text-sm text-white/40 mb-0.5">
              LAND #{listing.itemId.toString()} · INSPECTOR
            </p>
            <p
              className="font-jetbrains text-xs"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              by: {truncatePrincipal(sellerStr)}
            </p>
          </div>

          {/* Grid label */}
          <p className="font-jetbrains text-xs tracking-widest text-white/25 mb-3">
            MODIFIER SLOTS (49)
          </p>

          {/* 7×7 grid */}
          <div
            className="grid gap-1.5 mb-6"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {Array.from({ length: 49 }, (_, i) => {
              const mod = mods[i]; // slot i
              if (mod) {
                const catalog = getModCatalog(mod.modifierType);
                const rarity = getRarityMeta(mod.rarity_tier);
                return (
                  <div
                    key={mod.modifierInstanceId.toString()}
                    className="aspect-square rounded-lg overflow-hidden relative flex items-center justify-center"
                    style={{
                      border: `1px solid ${biomeColor}50`,
                      boxShadow: `0 0 8px ${biomeColor}30`,
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                    }}
                    title={mod.modifierType}
                  >
                    {catalog ? (
                      <img
                        src={catalog.asset_url}
                        alt={mod.modifierType}
                        className="w-full h-full object-cover"
                        style={{
                          filter: `drop-shadow(0 0 4px ${rarity.color})`,
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `${rarity.glow}` }}
                      >
                        <Zap size={12} style={{ color: rarity.color }} />
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={String(i + 100)}
                  className="aspect-square rounded-lg flex items-center justify-center"
                  style={{
                    border: "1px dashed rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <span className="font-jetbrains text-[9px] text-white/20">
                    #{i + 1}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bottom counters */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className="rounded-xl p-3 text-center"
              style={{
                background: `${biomeColor}12`,
                border: `1px solid ${biomeColor}30`,
              }}
            >
              <p
                className="font-orbitron text-3xl font-bold"
                style={{
                  color: biomeColor,
                  textShadow: `0 0 12px ${biomeColor}`,
                }}
              >
                {installed}
              </p>
              <p className="font-jetbrains text-xs text-white/40 mt-1 tracking-wider">
                INSTALLED
              </p>
            </div>
            <div
              className="rounded-xl p-3 text-center"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p className="font-orbitron text-3xl font-bold text-white/50">
                {free}
              </p>
              <p className="font-jetbrains text-xs text-white/30 mt-1 tracking-wider">
                FREE
              </p>
            </div>
            <div
              className="rounded-xl p-3 text-center"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <p className="font-orbitron text-3xl font-bold text-white">49</p>
              <p className="font-jetbrains text-xs text-white/40 mt-1 tracking-wider">
                TOTAL SLOTS
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// LAND LISTING CARD
// ─────────────────────────────────────────────

interface LandCardProps {
  listing: ListingItem;
  landData?: LandData;
  isMyListing: boolean;
  onBuy: () => void;
  onCancel: () => void;
  onInspect: () => void;
  isBuying: boolean;
  isCancelling: boolean;
}

function LandCard({
  listing,
  landData,
  isMyListing,
  onBuy,
  onCancel,
  onInspect,
  isBuying,
  isCancelling,
}: LandCardProps) {
  const [modsExpanded, setModsExpanded] = useState(false);
  const biome = landData?.biome ?? "";
  const biomeColor = getBiomeColor(biome);
  const displayBiome = BIOME_DISPLAY[biome] ?? "CYBER LAND";
  const mods = landData?.attachedModifications ?? [];
  const modCount = mods.length;
  const visibleMods = mods.slice(0, 7);
  const extraCount = modCount > 7 ? modCount - 7 : 0;
  const sellerStr = listing.seller.toString();

  return (
    <article
      className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.01]"
      style={{
        background:
          "linear-gradient(180deg, rgba(10,3,30,0.85) 0%, rgba(5,0,20,0.92) 100%)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${biomeColor}40`,
        boxShadow: `0 0 20px ${biomeColor}15, 0 4px 24px rgba(0,0,0,0.6)`,
      }}
      onClick={onInspect}
      onKeyDown={(e) => e.key === "Enter" && onInspect()}
      data-ocid="marketplace.card"
    >
      {/* Card top: biome name + land ID + seller avatar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h3
            className="font-orbitron font-bold text-lg leading-tight"
            style={{
              color: biomeColor,
              textShadow: `0 0 12px ${biomeColor}80`,
            }}
          >
            {displayBiome}
          </h3>
          <p
            className="font-jetbrains text-xs"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            LAND #{listing.itemId.toString()}
          </p>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`Seller: ${sellerStr}`, { duration: 5000 });
          }}
          title="Seller info"
          data-ocid="marketplace.secondary_button"
        >
          <User size={14} className="text-white/50" />
        </button>
      </div>

      {/* Hero image with smoke glow */}
      <div
        className="relative mx-4 rounded-xl overflow-hidden"
        style={{ height: "160px" }}
      >
        {/* Smoke pulse behind image */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background: `radial-gradient(ellipse at 50% 80%, ${biomeColor}50 0%, transparent 65%)`,
            animation: "landSmoke 3s ease-in-out infinite",
          }}
        />
        <img
          src="/assets/uploads/IMG_0577-1.webp"
          alt={displayBiome}
          className="w-full h-full object-contain relative z-10"
          style={{ mixBlendMode: "lighten" }}
        />
        {/* Edge glow overlay */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 50%, ${biomeColor}30 100%)`,
          }}
        />
      </div>

      {/* MODS count pill */}
      <div className="flex items-center px-4 mt-3">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-jetbrains text-xs"
          style={{
            border: `1px solid ${biomeColor}60`,
            background: `${biomeColor}12`,
          }}
        >
          <span
            className="font-orbitron font-bold text-sm"
            style={{ color: biomeColor }}
          >
            {modCount}
          </span>
          <span className="text-white/40">/ 49 MODS</span>
        </div>
      </div>

      {/* Price + buy/cancel */}
      <div
        className="flex items-center justify-between px-4 mt-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-end gap-1">
          <span
            className="font-orbitron font-bold text-3xl"
            style={{
              color: "#FAD26A",
              textShadow: "0 0 12px rgba(250,210,106,0.6)",
            }}
          >
            {formatCBRDisplay(listing.price)}
          </span>
          <span className="font-jetbrains text-sm text-white/40 mb-1 ml-1">
            CBR
          </span>
        </div>

        {isMyListing ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-orbitron text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: "rgba(220,38,38,0.15)",
              border: "1px solid rgba(220,38,38,0.5)",
              color: "#f87171",
              boxShadow: isCancelling ? "none" : "0 0 10px rgba(220,38,38,0.3)",
            }}
            data-ocid="marketplace.cancel_button"
          >
            {isCancelling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
            CANCEL
          </button>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={isBuying}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-orbitron text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: `${biomeColor}20`,
              border: `1px solid ${biomeColor}70`,
              color: biomeColor,
              boxShadow: isBuying ? "none" : `0 0 12px ${biomeColor}40`,
            }}
            data-ocid="marketplace.primary_button"
          >
            {isBuying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ShoppingCart size={14} />
            )}
            BUY
          </button>
        )}
      </div>

      {/* Installed mods slider */}
      {modCount > 0 && (
        <div
          className="px-4 pb-4 mt-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 overflow-hidden">
            {/* first 7 mods */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar flex-nowrap">
              {visibleMods.map((mod, _idx) => {
                const catalog = getModCatalog(mod.modifierType);
                const rarity = getRarityMeta(mod.rarity_tier);
                return (
                  <div
                    key={mod.modifierInstanceId.toString()}
                    className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${rarity.color}40`,
                      boxShadow: `0 0 6px ${rarity.glow}`,
                    }}
                    title={mod.modifierType}
                  >
                    {catalog ? (
                      <img
                        src={catalog.asset_url}
                        alt={mod.modifierType}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Zap size={10} style={{ color: rarity.color }} />
                    )}
                  </div>
                );
              })}
            </div>
            {extraCount > 0 && (
              <button
                type="button"
                className="flex-shrink-0 w-8 h-8 rounded-lg font-jetbrains text-[10px] font-bold flex items-center justify-center transition-all"
                style={{
                  background: `${biomeColor}15`,
                  border: `1px solid ${biomeColor}40`,
                  color: biomeColor,
                }}
                onClick={() => setModsExpanded((v) => !v)}
                data-ocid="marketplace.toggle"
              >
                +{extraCount}
              </button>
            )}
          </div>

          {/* Accordion expand */}
          <AnimatePresence>
            {modsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden mt-2"
              >
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
                >
                  {mods.map((mod) => {
                    const catalog = getModCatalog(mod.modifierType);
                    const rarity = getRarityMeta(mod.rarity_tier);
                    return (
                      <div
                        key={mod.modifierInstanceId.toString()}
                        className="aspect-square rounded-lg overflow-hidden flex items-center justify-center"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${rarity.color}30`,
                        }}
                        title={mod.modifierType}
                      >
                        {catalog ? (
                          <img
                            src={catalog.asset_url}
                            alt={mod.modifierType}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Zap size={8} style={{ color: rarity.color }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1 font-jetbrains text-xs text-white/30 hover:text-white/60"
                  onClick={() => setModsExpanded(false)}
                >
                  <ChevronUp size={12} /> Collapse
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!modsExpanded && extraCount > 0 && (
            <button
              type="button"
              className="mt-1 flex items-center gap-1 font-jetbrains text-xs text-white/30 hover:text-white/60"
              onClick={() => setModsExpanded(true)}
              data-ocid="marketplace.toggle"
            >
              <ChevronDown size={12} /> Show all {modCount} mods
            </button>
          )}
        </div>
      )}
      {modCount === 0 && <div className="pb-4" />}
    </article>
  );
}

// ─────────────────────────────────────────────
// MOD LISTING CARD
// ─────────────────────────────────────────────

interface ModCardProps {
  listing: ListingItem;
  isMyListing: boolean;
  onBuy: () => void;
  onCancel: () => void;
  isBuying: boolean;
  isCancelling: boolean;
}

function ModCard({
  listing,
  isMyListing,
  onBuy,
  onCancel,
  isBuying,
  isCancelling,
}: ModCardProps) {
  // Try lookup by item ID as catalog ID
  const catalogEntry = getCatalogById(Number(listing.itemId));
  const rarity = getRarityMeta(catalogEntry?.rarity_tier ?? 1);
  const modName = catalogEntry?.name ?? `MOD #${listing.itemId}`;
  const imgUrl = catalogEntry?.asset_url;
  const sellerStr = listing.seller.toString();

  return (
    <div
      className="rounded-xl overflow-hidden relative transition-all duration-300 hover:scale-[1.02]"
      style={{
        background:
          "linear-gradient(180deg, rgba(10,3,30,0.9) 0%, rgba(5,0,20,0.95) 100%)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${rarity.color}30`,
        boxShadow: `0 0 16px ${rarity.glow}`,
      }}
      data-ocid="marketplace.card"
    >
      {/* Seller avatar top-right */}
      <button
        type="button"
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/15"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          toast.info(`Seller: ${sellerStr}`, { duration: 5000 });
        }}
        data-ocid="marketplace.secondary_button"
      >
        <User size={12} className="text-white/50" />
      </button>

      {/* Mod image with glow cloud */}
      <div className="relative flex items-center justify-center p-5 pb-2">
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: rarity.glow, opacity: 0.35 }}
        />
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={modName}
            className="w-20 h-20 object-contain relative z-10"
            style={{ filter: `drop-shadow(0 0 10px ${rarity.color})` }}
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center relative z-10"
            style={{
              background: `${rarity.glow}`,
              boxShadow: `0 0 20px ${rarity.glow}`,
            }}
          >
            <Zap size={28} style={{ color: rarity.color }} />
          </div>
        )}
      </div>

      {/* Mod info */}
      <div className="px-3 pb-3">
        <p className="font-orbitron font-bold text-sm text-white text-center leading-tight mb-1">
          {modName}
        </p>
        <div className="flex items-center justify-center mb-2">
          <span
            className={`font-jetbrains text-xs font-bold ${rarity.textClass} px-2 py-0.5 rounded-full`}
            style={{
              background: `${rarity.glow}`,
              border: `1px solid ${rarity.color}50`,
            }}
          >
            {rarity.label}
          </span>
        </div>
        <p className="font-jetbrains text-xs text-white/25 text-center mb-3">
          ID: {listing.itemId.toString()}
        </p>

        {/* Price + action */}
        <div className="flex items-center justify-between">
          <div className="flex items-end gap-0.5">
            <span
              className="font-orbitron font-bold text-xl"
              style={{
                color: "#FAD26A",
                textShadow: "0 0 8px rgba(250,210,106,0.5)",
              }}
            >
              {formatCBRDisplay(listing.price)}
            </span>
            <span className="font-jetbrains text-xs text-white/30 mb-0.5 ml-0.5">
              CBR
            </span>
          </div>

          {isMyListing ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all disabled:opacity-50"
              style={{
                background: "rgba(220,38,38,0.15)",
                border: "1px solid rgba(220,38,38,0.4)",
                color: "#f87171",
              }}
              data-ocid="marketplace.cancel_button"
            >
              {isCancelling ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                "CANCEL"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onBuy}
              disabled={isBuying}
              className="px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all disabled:opacity-50"
              style={{
                background: `${rarity.glow}`,
                border: `1px solid ${rarity.color}60`,
                color: rarity.color,
                boxShadow: isBuying ? "none" : `0 0 8px ${rarity.glow}`,
              }}
              data-ocid="marketplace.primary_button"
            >
              {isBuying ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                "BUY"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CREATE LISTING MODAL
// ─────────────────────────────────────────────

interface CreateListingModalProps {
  open: boolean;
  onClose: () => void;
  myLands: LandData[];
  myMods: ModifierInstance[];
  onList: (itemId: bigint, itemType: ItemType, price: bigint) => Promise<void>;
  isListing: boolean;
}

function CreateListingModal({
  open,
  onClose,
  myLands,
  myMods,
  onList,
  isListing,
}: CreateListingModalProps) {
  const [activeTab, setActiveTab] = useState<"lands" | "mods">("lands");
  const [selectedLandId, setSelectedLandId] = useState<bigint | null>(null);
  const [selectedModId, setSelectedModId] = useState<bigint | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const parsedPrice = parseCBRPrice(priceInput);
  const hasSelection =
    (activeTab === "lands" && selectedLandId !== null) ||
    (activeTab === "mods" && selectedModId !== null);
  const canList = hasSelection && parsedPrice > BigInt(0);

  const handleList = async () => {
    if (!canList) return;
    const itemId = activeTab === "lands" ? selectedLandId! : selectedModId!;
    const itemType = activeTab === "lands" ? ItemType.Land : ItemType.Modifier;
    await onList(itemId, itemType, parsedPrice);
    setPriceInput("");
    setSelectedLandId(null);
    setSelectedModId(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg w-full p-0 border-0 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(5,0,18,0.98) 0%, rgba(15,0,40,0.97) 100%)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(0,255,200,0.2)",
          boxShadow: "0 0 40px rgba(0,255,200,0.1)",
        }}
        data-ocid="marketplace.modal"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-orbitron font-bold text-xl text-white">
              LIST FOR SALE
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70"
              style={{ background: "rgba(255,255,255,0.06)" }}
              data-ocid="marketplace.close_button"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {(["lands", "mods"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const color = tab === "lands" ? "#00ffcc" : "#cc00ff";
              return (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2 rounded-xl font-orbitron text-xs font-bold uppercase tracking-widest transition-all"
                  style={{
                    background: isActive
                      ? `${color}18`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isActive ? `${color}60` : "rgba(255,255,255,0.1)"}`,
                    color: isActive ? color : "rgba(255,255,255,0.4)",
                    boxShadow: isActive ? `0 0 12px ${color}30` : "none",
                  }}
                  data-ocid="marketplace.tab"
                >
                  {tab === "lands" ? "LANDS" : "MODIFIERS"}
                </button>
              );
            })}
          </div>

          {/* Inventory grid */}
          <div className="max-h-64 overflow-y-auto mb-5">
            {activeTab === "lands" ? (
              myLands.length === 0 ? (
                <p className="font-jetbrains text-xs text-white/30 text-center py-6">
                  No lands available to list
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {myLands.map((land) => {
                    const bc = getBiomeColor(land.biome);
                    const sel = selectedLandId === land.landId;
                    return (
                      <button
                        type="button"
                        key={land.landId.toString()}
                        onClick={() => setSelectedLandId(land.landId)}
                        className="rounded-xl overflow-hidden transition-all text-left"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: sel
                            ? `2px solid ${bc}`
                            : "1px solid rgba(255,255,255,0.1)",
                          boxShadow: sel ? `0 0 12px ${bc}40` : "none",
                        }}
                        data-ocid="marketplace.card"
                      >
                        <img
                          src="/assets/uploads/IMG_0577-1.webp"
                          alt={land.biome}
                          className="w-full h-16 object-cover"
                        />
                        <div className="p-2">
                          <p
                            className="font-orbitron text-xs font-bold truncate"
                            style={{ color: bc }}
                          >
                            {BIOME_DISPLAY[land.biome] ?? land.biome}
                          </p>
                          <p className="font-jetbrains text-[10px] text-white/30">
                            {land.attachedModifications.length}/49 MODS
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : myMods.length === 0 ? (
              <p className="font-jetbrains text-xs text-white/30 text-center py-6">
                No modifiers available to list
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {myMods.map((mod) => {
                  const catalog = getModCatalog(mod.modifierType);
                  const rarity = getRarityMeta(mod.rarity_tier);
                  const sel = selectedModId === mod.modifierInstanceId;
                  return (
                    <button
                      type="button"
                      key={mod.modifierInstanceId.toString()}
                      onClick={() => setSelectedModId(mod.modifierInstanceId)}
                      className="rounded-xl p-2 transition-all flex flex-col items-center gap-1"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: sel
                          ? `2px solid ${rarity.color}`
                          : "1px solid rgba(255,255,255,0.08)",
                        boxShadow: sel ? `0 0 10px ${rarity.glow}` : "none",
                      }}
                      data-ocid="marketplace.card"
                    >
                      {catalog ? (
                        <img
                          src={catalog.asset_url}
                          alt={mod.modifierType}
                          className="w-10 h-10 object-contain"
                          style={{
                            filter: `drop-shadow(0 0 4px ${rarity.color})`,
                          }}
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ background: rarity.glow }}
                        >
                          <Zap size={16} style={{ color: rarity.color }} />
                        </div>
                      )}
                      <p className="font-orbitron text-[9px] text-center text-white/70 leading-tight">
                        {mod.modifierType}
                      </p>
                      <span
                        className={`font-jetbrains text-[8px] font-bold ${rarity.textClass}`}
                      >
                        {rarity.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Price input */}
          <div className="mb-4">
            <label
              htmlFor="list-price-input"
              className="font-jetbrains text-xs text-white/40 mb-2 block tracking-widest"
            >
              PRICE (CBR)
            </label>
            <div className="relative">
              <Input
                id="list-price-input"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00"
                className="font-orbitron bg-white/5 border-white/15 focus:border-white/30 text-white placeholder:text-white/20"
                data-ocid="marketplace.input"
              />
              {priceInput && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-jetbrains text-xs text-white/30">
                  CBR
                </span>
              )}
            </div>
          </div>

          {/* List button */}
          <button
            type="button"
            onClick={handleList}
            disabled={!canList || isListing}
            className="w-full py-3 rounded-xl font-orbitron font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: canList
                ? "rgba(0,255,150,0.15)"
                : "rgba(255,255,255,0.05)",
              border: canList
                ? "1px solid rgba(0,255,150,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              color: canList ? "#00ff96" : "rgba(255,255,255,0.3)",
              boxShadow: canList ? "0 0 16px rgba(0,255,150,0.25)" : "none",
              animation:
                canList && !isListing
                  ? "listBtnPulse 2s ease-in-out infinite"
                  : "none",
            }}
            data-ocid="marketplace.submit_button"
          >
            {isListing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> LISTING...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Zap size={16} /> LIST FOR SALE
              </span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// MARKETPLACE — MAIN COMPONENT
// ─────────────────────────────────────────────

export default function Marketplace() {
  const { data: listings, isLoading } = useGetAllActiveListings();
  const { data: myLandArray } = useGetLandData();
  const { data: myModInventory } = useGetModifierInventory();
  const { identity } = useInternetIdentity();

  const buyItemMutation = useBuyItem();
  const listItemMutation = useListItem();
  const cancelListingMutation = useCancelListing();

  // UI state
  const [activeTab, setActiveTab] = useState<"lands" | "mods">("lands");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectorListing, setInspectorListing] = useState<ListingItem | null>(
    null,
  );
  const [buyingId, setBuyingId] = useState<bigint | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);
  const [landsPage, setLandsPage] = useState(0);
  const [modsPage, setModsPage] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<FilterState>({
    biomes: new Set(),
    rarities: new Set(),
    minPrice: 0,
    maxPrice: 10000,
    search: "",
  });

  const myPrincipal = identity?.getPrincipal().toString() ?? null;
  const safeListings = (listings ?? []) as ListingItem[];
  const myLands = myLandArray ?? [];
  const myMods = myModInventory ?? [];

  // PATH B: Extract land IDs from listings to fetch live land data for all sellers
  const landListingIds = useMemo(
    () =>
      safeListings
        .filter((l) => (l.itemType as string) === "Land")
        .map((l) => l.itemId),
    [safeListings],
  );
  const { data: publicLandDataMap } = useGetPublicLandDataBatch(landListingIds);

  const isMyListing = useCallback(
    (listing: ListingItem) => {
      if (!myPrincipal) return false;
      return listing.seller.toString() === myPrincipal;
    },
    [myPrincipal],
  );

  // Split listings into lands and mods
  const landListings = useMemo(
    () => safeListings.filter((l) => l.itemType === ItemType.Land),
    [safeListings],
  );
  const modListings = useMemo(
    () => safeListings.filter((l) => l.itemType === ItemType.Modifier),
    [safeListings],
  );

  // Search + filter for lands
  const filteredLandListings = useMemo(() => {
    return landListings.filter((listing) => {
      const price = Number(listing.price) / 100000000;
      if (price < filters.minPrice || price > filters.maxPrice) return false;
      if (filters.biomes.size > 0) {
        // We don't have biome in listing, skip biome filter for now
        // (would need backend enhancement)
      }
      if (searchValue) {
        const s = searchValue.toLowerCase();
        const idStr = listing.itemId.toString();
        if (!idStr.includes(s) && !listing.seller.toString().includes(s))
          return false;
      }
      return true;
    });
  }, [landListings, filters, searchValue]);

  // Search + filter for mods
  const filteredModListings = useMemo(() => {
    return modListings.filter((listing) => {
      const price = Number(listing.price) / 100000000;
      if (price < filters.minPrice || price > filters.maxPrice) return false;
      const catalog = getCatalogById(Number(listing.itemId));
      if (filters.rarities.size > 0 && catalog) {
        if (!filters.rarities.has(catalog.rarity_tier)) return false;
      }
      if (searchValue) {
        const s = searchValue.toLowerCase();
        const name = catalog?.name.toLowerCase() ?? "";
        if (!name.includes(s) && !listing.itemId.toString().includes(s))
          return false;
      }
      return true;
    });
  }, [modListings, filters, searchValue]);

  // Pagination
  const LANDS_PER_PAGE = 7;
  const MODS_PER_PAGE = 12;

  const pagedLands = useMemo(
    () =>
      filteredLandListings.slice(
        landsPage * LANDS_PER_PAGE,
        (landsPage + 1) * LANDS_PER_PAGE,
      ),
    [filteredLandListings, landsPage],
  );
  const pagedMods = useMemo(
    () =>
      filteredModListings.slice(
        modsPage * MODS_PER_PAGE,
        (modsPage + 1) * MODS_PER_PAGE,
      ),
    [filteredModListings, modsPage],
  );

  const totalLandsPages = Math.max(
    1,
    Math.ceil(filteredLandListings.length / LANDS_PER_PAGE),
  );
  const totalModsPages = Math.max(
    1,
    Math.ceil(filteredModListings.length / MODS_PER_PAGE),
  );

  // Find land data for a listing (by landId)
  // PATH B: checks live publicLandDataMap first (covers any seller), then own lands as fallback
  const getLandDataForListing = useCallback(
    (listing: ListingItem): LandData | undefined => {
      if (publicLandDataMap) {
        const liveData = publicLandDataMap.get(listing.itemId.toString());
        if (liveData) return liveData;
      }
      return myLands.find((l) => l.landId === listing.itemId);
    },
    [myLands, publicLandDataMap],
  );

  const handleBuy = async (listing: ListingItem) => {
    setBuyingId(listing.listingId);
    try {
      const result = await buyItemMutation.mutateAsync(listing.listingId);
      if (result.__kind__ === "success") {
        toast.success("Purchase successful!", {
          description: `You paid ${formatCBRDisplay(listing.price)} CBR`,
        });
      } else if (result.__kind__ === "insufficientFunds") {
        toast.error("Insufficient CBR balance");
      } else if (result.__kind__ === "cannotBuyOwnListing") {
        toast.error("Cannot buy your own listing");
      } else if (result.__kind__ === "listingNotFound") {
        toast.error("Listing no longer available");
      } else {
        toast.error("Purchase failed");
      }
    } catch (e) {
      toast.error("Transaction failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBuyingId(null);
    }
  };

  const handleCancel = async (listing: ListingItem) => {
    setCancellingId(listing.listingId);
    try {
      await cancelListingMutation.mutateAsync(listing.listingId);
      toast.success("Listing cancelled");
    } catch (e) {
      toast.error("Failed to cancel", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleList = async (
    itemId: bigint,
    itemType: ItemType,
    price: bigint,
  ) => {
    try {
      await listItemMutation.mutateAsync({ itemId, itemType, price });
      toast.success("Item listed successfully!");
      setCreateOpen(false);
    } catch (e) {
      toast.error("Failed to list item", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const currentListings =
    activeTab === "lands" ? filteredLandListings : filteredModListings;
  const hasListings = currentListings.length > 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,255,200,0.1)",
            border: "1px solid rgba(0,255,200,0.3)",
            boxShadow: "0 0 20px rgba(0,255,200,0.2)",
          }}
          data-ocid="marketplace.loading_state"
        >
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "#00ffc8" }}
          />
        </div>
        <p className="font-jetbrains text-sm text-white/40">
          Loading marketplace...
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Injected keyframes */}
      <style>{`
        @keyframes landSmoke {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.55; }
        }
        @keyframes listBtnPulse {
          0%, 100% { box-shadow: 0 0 16px rgba(0,255,150,0.25); }
          50% { box-shadow: 0 0 28px rgba(0,255,150,0.5), 0 0 40px rgba(0,255,150,0.2); }
        }
        @keyframes tabActivePulse {
          0%, 100% { box-shadow: 0 0 8px currentColor; }
          50% { box-shadow: 0 0 18px currentColor; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Inspector modal */}
      {inspectorListing && (
        <InspectorModal
          open={!!inspectorListing}
          onClose={() => setInspectorListing(null)}
          listing={inspectorListing}
          landData={getLandDataForListing(inspectorListing)}
        />
      )}

      {/* Create Listing Modal */}
      <CreateListingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        myLands={myLands}
        myMods={myMods}
        onList={handleList}
        isListing={listItemMutation.isPending}
      />

      {/* ─── HEADER ROW ─── */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {/* Filter button */}
        <button
          type="button"
          onClick={() => setFilterDrawerOpen(true)}
          className="flex items-center justify-center w-10 h-10 rounded-full transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(160,60,255,0.45)",
            boxShadow: filterDrawerOpen
              ? "0 0 14px rgba(160,60,255,0.5)"
              : "0 0 6px rgba(160,60,255,0.2)",
          }}
          data-ocid="marketplace.filter.button"
        >
          <Filter size={16} style={{ color: "#a040ff" }} />
        </button>

        {/* LANDS / MODS toggle */}
        {(["lands", "mods"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const color = tab === "lands" ? "#00e5ff" : "#cc00ff";
          return (
            <button
              type="button"
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setLandsPage(0);
                setModsPage(0);
              }}
              className="px-5 h-10 rounded-full font-orbitron font-bold text-xs uppercase tracking-widest transition-all"
              style={{
                backdropFilter: "blur(12px)",
                background: isActive ? `${color}15` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? `${color}70` : "rgba(255,255,255,0.12)"}`,
                color: isActive ? color : "rgba(255,255,255,0.35)",
                boxShadow: isActive
                  ? `0 0 14px ${color}45, inset 0 0 8px ${color}10`
                  : "none",
                animation: isActive
                  ? "tabActivePulse 2.5s ease-in-out infinite"
                  : "none",
              }}
              data-ocid="marketplace.tab"
            >
              {tab === "lands" ? "LANDS" : "MODS"}
            </button>
          );
        })}

        {/* Search button / input */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {searchOpen ? (
              <motion.div
                key="search-open"
                initial={{ width: 40, opacity: 0.5 }}
                animate={{ width: 220, opacity: 1 }}
                exit={{ width: 40, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center overflow-hidden rounded-full h-10"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <Search
                  size={14}
                  className="ml-3 flex-shrink-0 text-white/40"
                />
                <input
                  ref={searchInputRef}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search by biome or name..."
                  className="flex-1 bg-transparent font-jetbrains text-xs text-white placeholder:text-white/25 outline-none px-2"
                  style={{ minWidth: 0 }}
                  data-ocid="marketplace.search_input"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => setSearchValue("")}
                    className="mr-2 text-white/30 hover:text-white/60"
                  >
                    <X size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchValue("");
                  }}
                  className="mr-2 text-white/30 hover:text-white/60 flex-shrink-0"
                  data-ocid="marketplace.close_button"
                >
                  <X size={14} />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="search-closed"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                data-ocid="marketplace.search_input"
              >
                <Search size={16} className="text-white/50" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* SELL button */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="ml-auto flex items-center gap-2 px-5 h-10 rounded-full font-orbitron font-bold text-xs uppercase tracking-widest transition-all"
          style={{
            backdropFilter: "blur(12px)",
            background: "rgba(0,255,96,0.12)",
            border: "1px solid rgba(0,255,96,0.5)",
            color: "#00ff60",
            boxShadow: "0 0 12px rgba(0,255,96,0.3)",
            animation: "listBtnPulse 2.5s ease-in-out infinite",
          }}
          data-ocid="marketplace.open_modal_button"
        >
          <span style={{ fontSize: "14px" }}>+</span> SELL
        </button>
      </div>

      {/* ─── CONTENT ─── */}
      {!hasListings ? (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 gap-6"
          data-ocid="marketplace.empty_state"
        >
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(0,255,200,0.08)",
              border: "1px solid rgba(0,255,200,0.2)",
              boxShadow: "0 0 30px rgba(0,255,200,0.1)",
            }}
          >
            <Store size={36} style={{ color: "rgba(0,255,200,0.5)" }} />
          </div>
          <div className="text-center">
            <h3 className="font-orbitron font-bold text-xl text-white mb-2">
              NO LISTINGS YET
            </h3>
            <p className="font-jetbrains text-sm text-white/30 max-w-xs">
              Be the first to list a land or modifier for sale
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-orbitron font-bold text-sm uppercase tracking-widest transition-all"
            style={{
              background: "rgba(0,255,150,0.12)",
              border: "1px solid rgba(0,255,150,0.45)",
              color: "#00ff96",
              boxShadow: "0 0 16px rgba(0,255,150,0.2)",
            }}
            data-ocid="marketplace.primary_button"
          >
            <span>+</span> SELL
          </button>
        </motion.div>
      ) : (
        <>
          {activeTab === "lands" ? (
            <div className="space-y-4">
              {pagedLands.map((listing) => (
                <LandCard
                  key={listing.listingId.toString()}
                  listing={listing}
                  landData={getLandDataForListing(listing)}
                  isMyListing={isMyListing(listing)}
                  onBuy={() => handleBuy(listing)}
                  onCancel={() => handleCancel(listing)}
                  onInspect={() => setInspectorListing(listing)}
                  isBuying={buyingId === listing.listingId}
                  isCancelling={cancellingId === listing.listingId}
                />
              ))}

              {/* Pagination lands */}
              {totalLandsPages > 1 && (
                <div
                  className="flex items-center justify-center gap-2 pt-4"
                  data-ocid="marketplace.pagination_next"
                >
                  <button
                    type="button"
                    onClick={() => setLandsPage((p) => Math.max(0, p - 1))}
                    disabled={landsPage === 0}
                    className="w-9 h-9 rounded-full font-jetbrains text-sm flex items-center justify-center disabled:opacity-30 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.6)",
                    }}
                    data-ocid="marketplace.pagination_prev"
                  >
                    ←
                  </button>
                  {Array.from({ length: totalLandsPages }, (_, idx) => idx).map(
                    (pageNum) => (
                      <button
                        type="button"
                        key={pageNum}
                        onClick={() => setLandsPage(pageNum)}
                        className="w-9 h-9 rounded-full font-orbitron text-xs font-bold flex items-center justify-center transition-all"
                        style={{
                          background:
                            landsPage === pageNum
                              ? "rgba(0,229,255,0.15)"
                              : "rgba(255,255,255,0.04)",
                          border:
                            landsPage === pageNum
                              ? "1px solid rgba(0,229,255,0.6)"
                              : "1px solid rgba(255,255,255,0.1)",
                          color:
                            landsPage === pageNum
                              ? "#00e5ff"
                              : "rgba(255,255,255,0.4)",
                          boxShadow:
                            landsPage === pageNum
                              ? "0 0 10px rgba(0,229,255,0.3)"
                              : "none",
                        }}
                      >
                        {pageNum + 1}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setLandsPage((p) => Math.min(totalLandsPages - 1, p + 1))
                    }
                    disabled={landsPage >= totalLandsPages - 1}
                    className="w-9 h-9 rounded-full font-jetbrains text-sm flex items-center justify-center disabled:opacity-30 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.6)",
                    }}
                    data-ocid="marketplace.pagination_next"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-4">
                {pagedMods.map((listing) => (
                  <ModCard
                    key={listing.listingId.toString()}
                    listing={listing}
                    isMyListing={isMyListing(listing)}
                    onBuy={() => handleBuy(listing)}
                    onCancel={() => handleCancel(listing)}
                    isBuying={buyingId === listing.listingId}
                    isCancelling={cancellingId === listing.listingId}
                  />
                ))}
              </div>

              {/* Pagination mods */}
              {totalModsPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-6">
                  <button
                    type="button"
                    onClick={() => setModsPage((p) => Math.max(0, p - 1))}
                    disabled={modsPage === 0}
                    className="w-9 h-9 rounded-full font-jetbrains text-sm flex items-center justify-center disabled:opacity-30"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.6)",
                    }}
                    data-ocid="marketplace.pagination_prev"
                  >
                    ←
                  </button>
                  {Array.from({ length: totalModsPages }, (_, idx) => idx).map(
                    (pageNum) => (
                      <button
                        type="button"
                        key={pageNum}
                        onClick={() => setModsPage(pageNum)}
                        className="w-9 h-9 rounded-full font-orbitron text-xs font-bold flex items-center justify-center transition-all"
                        style={{
                          background:
                            modsPage === pageNum
                              ? "rgba(204,0,255,0.15)"
                              : "rgba(255,255,255,0.04)",
                          border:
                            modsPage === pageNum
                              ? "1px solid rgba(204,0,255,0.6)"
                              : "1px solid rgba(255,255,255,0.1)",
                          color:
                            modsPage === pageNum
                              ? "#cc00ff"
                              : "rgba(255,255,255,0.4)",
                          boxShadow:
                            modsPage === pageNum
                              ? "0 0 10px rgba(204,0,255,0.3)"
                              : "none",
                        }}
                      >
                        {pageNum + 1}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setModsPage((p) => Math.min(totalModsPages - 1, p + 1))
                    }
                    disabled={modsPage >= totalModsPages - 1}
                    className="w-9 h-9 rounded-full font-jetbrains text-sm flex items-center justify-center disabled:opacity-30"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.6)",
                    }}
                    data-ocid="marketplace.pagination_next"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
