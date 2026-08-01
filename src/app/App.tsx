import { useState, useEffect, useRef } from "react";
import { Phone, Mail, X, ArrowUpRight, ChevronRight, ShoppingBag, Plus, Minus, Trash2, MessageCircle, Check, Search, User } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import catalogImg from "@/imports/WhatsApp_Image_2026-07-24_at_12.46.44_AM.jpeg";

const BRAND = "AYAN apparels";
const HERO_CLOTHING = "/products/hero-polo-green.png?v=2";

/** Primary CTA — matches the Tradewood pill button */
const ctaStyle: React.CSSProperties = {
  backgroundColor: "#0A0A0A",
  color: "#FFFFFF",
  padding: "12px 30px",
  borderRadius: "50px",
  fontWeight: 500,
  border: "none",
  cursor: "pointer",
  fontFamily: "'Outfit', sans-serif",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  transition: "opacity 0.2s ease, transform 0.2s ease",
};

const CATEGORIES = [
  "All",
  "Round Neck T-Shirts",
  "Mandarin Shirts",
  "Polo Shirts",
  "Complete Polo Suits",
  "Men's Trousers",
] as const;
type Category = (typeof CATEGORIES)[number];

interface Product {
  id: number;
  name: string;
  code: string;
  category: Exclude<Category, "All">;
  fabric: string;
  gsm: string;
  minOrder: string;
  colors: string[];
  colorNames?: string[];
  /** One image URL per color (same order as colors). Falls back to `image`. */
  colorImages?: string[];
  sizes: string[];
  image: string;
  badge?: string;
  features?: string[];
}

// ─── Ordering / WhatsApp config ─────────────────────────────
// Same number as the "Call to Order" phone button, in international
// format without "+", spaces, or dashes — required for wa.me links.
const WHATSAPP_NUMBER = "923303834478";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
const MIN_ORDER_QTY = 50;
const MAX_ORDER_QTY = 500;
const QTY_STEP = 10;

interface CartItem {
  /** Unique line key: productId + color + size (one cart row per variant) */
  lineId: string;
  product: Product;
  quantity: number;
  color: string;
  colorName: string;
  size: string;
  /** Image for the selected color variant */
  image: string;
}

const CART_STORAGE_KEY = "ayan-apparel-cart-v4";

function cartLineId(productId: number, color: string, size: string) {
  return `${productId}::${color}::${size}`;
}

function loadCartFromStorage(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CartItem =>
          item &&
          typeof item === "object" &&
          item.product &&
          typeof item.quantity === "number" &&
          typeof item.color === "string" &&
          typeof item.size === "string"
      )
      .map((item) => ({
        ...item,
        colorName: typeof item.colorName === "string" ? item.colorName : "",
        lineId: item.lineId || cartLineId(item.product.id, item.color, item.size),
        image:
          typeof item.image === "string" && item.image
            ? item.image
            : productImageForColor(item.product, item.product.colors?.indexOf(item.color) ?? -1),
      }));
  } catch {
    return [];
  }
}

// ─── Load products from /public/products.csv ───────────────
// Edit that CSV file to add, remove, or update products — no code changes needed.
// For fields that hold multiple values (colors, colorNames, colorImages, sizes, features),
// separate each value with a pipe "|" character inside that cell.
// colorImages should match the same order as colors (one URL per color).
function productImageForColor(product: Product, colorIdx: number | null | undefined): string {
  if (colorIdx != null && colorIdx >= 0 && product.colorImages?.[colorIdx]) {
    return product.colorImages[colorIdx];
  }
  return product.image;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvToProducts(text: string): Product[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== "")).map((r) => {
    const get = (key: string) => {
      const idx = header.indexOf(key);
      return idx === -1 ? "" : (r[idx] ?? "").trim();
    };
    const splitPipe = (v: string) => (v ? v.split("|").map((s) => s.trim()).filter(Boolean) : []);
    return {
      id: Number(get("id")),
      name: get("name"),
      code: get("code"),
      category: get("category") as Product["category"],
      fabric: get("fabric"),
      gsm: get("gsm"),
      minOrder: get("minOrder"),
      colors: splitPipe(get("colors")),
      colorNames: splitPipe(get("colorNames")),
      colorImages: splitPipe(get("colorImages")),
      sizes: splitPipe(get("sizes")),
      image: get("image"),
      badge: get("badge") || undefined,
      features: splitPipe(get("features")),
    };
  }).map((p) => ({
    ...p,
    // If colorImages missing/short, pad with main image so selection still works
    colorImages:
      p.colorImages && p.colorImages.length
        ? p.colors.map((_, i) => p.colorImages![i] || p.image)
        : undefined,
  }));
}

function useProducts() {
  const [products, setProducts] = useState<Product[]>(SAMPLE_PRODUCTS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/products.csv")
      .then((res) => res.text())
      .then((text) => {
        const parsed = csvToProducts(text);
        if (parsed.length) setProducts(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { products, loading };
}

function useCart() {
  // Load from this device's localStorage on first render so each visitor
  // keeps a private cart (no shared server / no auth required).
  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage());

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage write failures (e.g. private browsing)
    }
  }, [cart]);

  const addToCart = (
    product: Product,
    quantity: number,
    variant: { color: string; colorName: string; size: string }
  ) => {
    const lineId = cartLineId(product.id, variant.color, variant.size);
    const colorIdx = product.colors.indexOf(variant.color);
    const image = productImageForColor(product, colorIdx);
    setCart((prev) => {
      const existing = prev.find((item) => item.lineId === lineId);
      if (existing) {
        const merged = Math.min(MAX_ORDER_QTY, existing.quantity + quantity);
        return prev.map((item) => (item.lineId === lineId ? { ...item, quantity: merged, image } : item));
      }
      return [
        ...prev,
        {
          lineId,
          product,
          quantity,
          color: variant.color,
          colorName: variant.colorName,
          size: variant.size,
          image,
        },
      ];
    });
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.lineId === lineId
          ? { ...item, quantity: Math.max(MIN_ORDER_QTY, Math.min(MAX_ORDER_QTY, quantity)) }
          : item
      )
    );
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((item) => item.lineId !== lineId));
  };

  const clearCart = () => setCart([]);

  const totalPieces = cart.reduce((sum, item) => sum + item.quantity, 0);

  return { cart, addToCart, updateQuantity, removeFromCart, clearCart, totalPieces };
}

function buildWhatsAppOrderUrl(cart: CartItem[], customer: { name: string; company: string; notes: string }) {
  const lines = [
    "Hello AYAN apparels! I'd like to place a wholesale order:",
    "",
    ...cart.map((item, i) => {
      const colorLabel = item.colorName || item.color;
      return `${i + 1}. ${item.product.name} (${item.product.code}) — Color: ${colorLabel}, Size: ${item.size} — ${item.quantity} pcs`;
    }),
    "",
    `Total: ${cart.reduce((sum, item) => sum + item.quantity, 0)} pcs across ${cart.length} product(s)`,
  ];
  if (customer.name.trim()) lines.push("", `Name: ${customer.name.trim()}`);
  if (customer.company.trim()) lines.push(`Company / City: ${customer.company.trim()}`);
  if (customer.notes.trim()) lines.push(`Notes: ${customer.notes.trim()}`);
  lines.push("", "Please confirm availability & pricing. Thank you!");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "AA Contrast Trim Tee",
    code: "AA-RN-001",
    category: "Round Neck T-Shirts",
    fabric: "100% Cotton Jersey",
    gsm: "220 GSM",
    minOrder: "50 pcs / color",
    colors: ["#19191A", "#14192B", "#353436", "#1C271E", "#4B1F33", "#C6A886", "#F0F0F2", "#6483AC"],
    colorNames: ["Black", "Navy", "Charcoal", "Forest Green", "Burgundy", "Beige", "White", "Sky Blue"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/ringer-black.jpg",
    colorImages: [
      "/products/ringer-black.jpg",
      "/products/ringer-navy.jpg",
      "/products/ringer-charcoal.jpg",
      "/products/ringer-forest.jpg",
      "/products/ringer-burgundy.jpg",
      "/products/ringer-beige.jpg",
      "/products/ringer-white.jpg",
      "/products/ringer-sky.jpg",
    ],
    badge: "Bestseller",
    features: ["White Contrast Collar", "White Cuff & Hem", "AA Chest Embroidery", "Soft Cotton Jersey"],
  },
  {
    id: 2,
    name: "AA Contrast Collar Kurta",
    code: "AA-MD-001",
    category: "Mandarin Shirts",
    fabric: "Cotton Blend Jersey",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#252328", "#6B6E72", "#3A3A3E", "#4A4A4E", "#B8B8B4"],
    colorNames: ["Black", "Heather Grey", "Dark Grey", "Charcoal", "Light Grey"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/mandarin-contrast-black.jpg",
    colorImages: [
      "/products/mandarin-contrast-black.jpg",
      "/products/mandarin-contrast-heather-grey.jpg",
      "/products/mandarin-contrast-dark-grey.jpg",
      "/products/mandarin-contrast-charcoal.jpg",
      "/products/mandarin-contrast-light-grey.jpg",
    ],
    badge: "New",
    features: ["Mandarin Collar", "Heather Contrast Trim", "Wood Buttons", "Side Slits"],
  },
  {
    id: 3,
    name: "AA Mandarin Placket Shirt",
    code: "AA-MD-002",
    category: "Mandarin Shirts",
    fabric: "Textured Cotton",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#1D1C1F", "#5A5E62", "#2B2E3C"],
    colorNames: ["Black", "Grey", "Navy"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/mandarin-placket-black.jpg",
    colorImages: [
      "/products/mandarin-placket-black.jpg",
      "/products/mandarin-placket-grey.jpg",
      "/products/mandarin-placket-navy.jpg",
    ],
    features: ["Mandarin Collar", "Grey Placket Detail", "AA Embroidery", "3/4 Sleeve"],
  },
  {
    id: 4,
    name: "AA Piping Mandarin Shirt",
    code: "AA-MD-003",
    category: "Mandarin Shirts",
    fabric: "Heathered Cotton Blend",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#273145", "#2C2C30", "#1A2744", "#2A5C58", "#C8C8C4"],
    colorNames: ["Indigo", "Charcoal", "Navy", "Teal", "Light Grey"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/mandarin-piping-indigo.jpg",
    colorImages: [
      "/products/mandarin-piping-indigo.jpg",
      "/products/mandarin-piping-charcoal.jpg",
      "/products/mandarin-piping-navy.jpg",
      "/products/mandarin-piping-teal.jpg",
      "/products/mandarin-piping-light-grey.jpg",
    ],
    badge: "2026 Collection",
    features: ["Contrast Piping", "Button Cuff Tab", "AA Chest & Collar Logo", "Side Slits"],
  },
  {
    id: 5,
    name: "AA Soft Tone Mandarin",
    code: "AA-MD-004",
    category: "Mandarin Shirts",
    fabric: "Heathered Cotton",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#879583", "#A89BB0", "#8FA4B8", "#5E8A8E"],
    colorNames: ["Sage", "Lavender", "Sky", "Teal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/mandarin-soft-sage.jpg",
    colorImages: [
      "/products/mandarin-soft-sage.jpg",
      "/products/mandarin-soft-lavender.jpg",
      "/products/mandarin-soft-sky.jpg",
      "/products/mandarin-soft-teal.jpg",
    ],
    badge: "New",
    features: ["Grey Contrast Collar", "Wood Buttons", "Rolled Cuff Detail", "AA Embroidery"],
  },
  {
    id: 6,
    name: "AA Stripe Quarter-Zip Polo",
    code: "AA-PO-001",
    category: "Polo Shirts",
    fabric: "Fine Gauge Knit",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#F5F0E8", "#19191A", "#0D0D0D"],
    colorNames: ["Cream", "Black", "Bold Stripe"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/polo-stripe-zip-cream.png",
    colorImages: [
      "/products/polo-stripe-zip-cream.png",
      "/products/polo-stripe-zip-black.png",
      "/products/polo-stripe-zip-bold.png",
    ],
    badge: "New",
    features: ["Quarter-Zip Closure", "Vertical Stripe Detail", "Ribbed Hem & Cuffs", "Knit Polo Fit"],
  },
  {
    id: 7,
    name: "AA Cable Knit Polo",
    code: "AA-PO-002",
    category: "Polo Shirts",
    fabric: "Textured Cable Knit",
    gsm: "260 GSM",
    minOrder: "50 pcs / color",
    colors: ["#F0F0F2", "#C6A886", "#1C271E", "#14192B"],
    colorNames: ["White", "Beige", "Forest", "Navy"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/polo-cable-white.png",
    colorImages: [
      "/products/polo-cable-white.png",
      "/products/polo-cable-beige.png",
      "/products/polo-cable-forest.png",
      "/products/polo-cable-navy.png",
    ],
    badge: "Bestseller",
    features: ["Cable Knit Texture", "Classic Polo Collar", "Short Sleeve", "Premium Knit"],
  },
  {
    id: 8,
    name: "AA Contrast Collar Polo",
    code: "AA-PO-003",
    category: "Polo Shirts",
    fabric: "Geometric Knit",
    gsm: "240 GSM",
    minOrder: "50 pcs / color",
    colors: ["#F0F0F2"],
    colorNames: ["White Navy"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/polo-contrast-white-navy.png",
    colorImages: ["/products/polo-contrast-white-navy.png"],
    badge: "New",
    features: ["Navy Contrast Collar", "Geometric Body Texture", "Contrast Cuffs", "Button Placket"],
  },
  {
    id: 9,
    name: "AA Ribbed Polo Suit",
    code: "AA-SU-001",
    category: "Complete Polo Suits",
    fabric: "Ribbed Knit + Twill",
    gsm: "250 GSM",
    minOrder: "50 pcs / set",
    colors: ["#3C2415", "#14192B"],
    colorNames: ["Brown", "Navy"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/suit-ribbed-brown.png",
    colorImages: ["/products/suit-ribbed-brown.png", "/products/suit-ribbed-navy.png"],
    badge: "New",
    features: ["Ribbed Polo", "Cream Trousers", "Sunglasses Included", "Loafers Styled"],
  },
  {
    id: 10,
    name: "AA Classic Polo Suit",
    code: "AA-SU-002",
    category: "Complete Polo Suits",
    fabric: "Pique Cotton + Twill",
    gsm: "240 GSM",
    minOrder: "50 pcs / set",
    colors: ["#14192B", "#F5F0E8", "#3C2415", "#19191A"],
    colorNames: ["Navy", "Cream", "Dark Brown", "Black"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/suit-classic-navy.png",
    colorImages: [
      "/products/suit-classic-navy.png",
      "/products/suit-classic-cream.png",
      "/products/suit-classic-brown.png",
      "/products/suit-classic-black.png",
    ],
    badge: "Bestseller",
    features: ["Polo + Trousers Set", "Glasses Included", "Watch Styled", "Complete Look"],
  },
  {
    id: 11,
    name: "AA Matching Co-Ord Set",
    code: "AA-SU-003",
    category: "Complete Polo Suits",
    fabric: "Textured Matching Fabric",
    gsm: "240 GSM",
    minOrder: "50 pcs / set",
    colors: ["#19191A", "#4A4A52"],
    colorNames: ["Black", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "/products/suit-coord-black.png",
    colorImages: ["/products/suit-coord-black.png", "/products/suit-coord-charcoal.png"],
    features: ["Matching Top & Pants", "Sunglasses Included", "Coordinated Accessories", "Casual Set"],
  },
  {
    id: 12,
    name: "AA Pleated Dress Trousers",
    code: "AA-TR-001",
    category: "Men's Trousers",
    fabric: "Cotton Twill Blend",
    gsm: "280 GSM",
    minOrder: "50 pcs / color",
    colors: ["#F0F0F2", "#C6A886", "#19191A", "#A67C52"],
    colorNames: ["White", "Beige", "Black", "Tan"],
    sizes: ["28", "30", "32", "34", "36"],
    image: "/products/trousers-white.png",
    colorImages: [
      "/products/trousers-white.png",
      "/products/trousers-beige.png",
      "/products/trousers-black.png",
      "/products/trousers-tan.png",
    ],
    badge: "New",
    features: ["Front Pleats", "Pressed Crease", "Belt Loops", "Straight Leg"],
  },
];

function useInView(ref: React.RefObject<Element>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => setInView(true);
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95 && rect.bottom > 0) {
      reveal();
      return;
    }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) reveal(); }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return inView;
}

function AnimateIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [previewColorIdx, setPreviewColorIdx] = useState(0);
  const displayImage = productImageForColor(product, previewColorIdx);
  const previewName = product.colorNames?.[previewColorIdx];
  return (
    <article
      className="group cursor-pointer relative flex flex-col overflow-hidden rounded-2xl"
      style={{
        backgroundColor: "var(--card)",
        border: `1px solid ${hovered ? "var(--accent)" : "var(--border)"}`,
        boxShadow: hovered ? "0 12px 40px rgba(10,10,10,0.08)" : "0 2px 12px rgba(10,10,10,0.04)",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", backgroundColor: "#F4F4F2" }}>
        <img
          key={displayImage}
          src={displayImage}
          alt={`${product.name}${previewName ? ` — ${previewName}` : ""}`}
          className="absolute inset-0 w-full h-full object-contain object-center select-none pointer-events-none"
          draggable={false}
          style={{
            transition: "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)",
            transform: hovered ? "scale(1.03)" : "scale(1)",
            backgroundColor: "#6D6E71",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: hovered
              ? "linear-gradient(to top, rgba(212,255,0,0.18) 0%, transparent 45%)"
              : "linear-gradient(to top, rgba(10,10,10,0.45) 0%, transparent 45%)",
            transition: "background 0.4s ease",
          }}
        />
        {product.badge && (
          <div
            className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-semibold tracking-widest uppercase rounded-full"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'Outfit', sans-serif" }}
          >
            {product.badge}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ fontFamily: "'Outfit', sans-serif", color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
            {product.code}
          </p>
          <h3 className="text-lg font-bold leading-tight text-white" style={{ fontFamily: "'Syne', sans-serif" }}>
            {product.name}
          </h3>
          {previewName && (
            <p className="text-[11px] mt-0.5" style={{ fontFamily: "'Outfit', sans-serif", color: "rgba(255,255,255,0.8)" }}>
              {previewName}
            </p>
          )}
        </div>
        <div
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full"
          style={{
            backgroundColor: "var(--accent)",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "scale(1)" : "scale(0.6)",
            transition: "all 0.3s ease",
          }}
        >
          <ArrowUpRight size={14} color="#0A0A0A" />
        </div>
      </div>

      <div className="flex items-center justify-between px-3.5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {product.colors.map((c, i) => {
            const active = previewColorIdx === i;
            return (
              <button
                key={`${c}-${i}`}
                type="button"
                aria-label={product.colorNames?.[i] || `Color ${i + 1}`}
                aria-pressed={active}
                title={product.colorNames?.[i]}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewColorIdx(i);
                }}
                className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-transform"
                style={{
                  backgroundColor: c,
                  border: active ? "2px solid #0A0A0A" : "1px solid rgba(10,10,10,0.12)",
                  boxShadow: active ? "0 0 0 2px var(--accent)" : "none",
                  transform: active ? "scale(1.15)" : "scale(1)",
                }}
              />
            );
          })}
        </div>
        <span className="text-xs font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>{product.gsm}</span>
      </div>
    </article>
  );
}

function ProductModal({
  product,
  onClose,
  onAddToCart,
  onOpenCart,
}: {
  product: Product;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    quantity: number,
    variant: { color: string; colorName: string; size: string }
  ) => void;
  onOpenCart: () => void;
}) {
  const [qty, setQty] = useState(MIN_ORDER_QTY);
  const [selectedColorIdx, setSelectedColorIdx] = useState<number | null>(
    product.colors.length ? 0 : null
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(
    product.sizes.length === 1 ? product.sizes[0] : null
  );
  const [added, setAdded] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const clamp = (n: number) => Math.max(MIN_ORDER_QTY, Math.min(MAX_ORDER_QTY, n));

  const handleAdd = () => {
    if (selectedColorIdx === null || !selectedSize) {
      setSelectionError("Please select a color and size before adding to cart.");
      return;
    }
    setSelectionError("");
    const color = product.colors[selectedColorIdx];
    const colorName = product.colorNames?.[selectedColorIdx] || color;
    onAddToCart(product, clamp(qty), { color, colorName, size: selectedSize });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const canAdd = selectedColorIdx !== null && selectedSize !== null;
  const displayImage = productImageForColor(product, selectedColorIdx);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      style={{ backgroundColor: "rgba(10,10,10,0.45)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] relative rounded-3xl flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 80px rgba(10,10,10,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: "var(--accent)" }} />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
        >
          <X size={15} />
        </button>

        <div className="grid md:grid-cols-5 flex-1 min-h-0 overflow-hidden">
          {/* Image fills the left frame completely */}
          <div
            className="md:col-span-2 relative overflow-hidden min-h-[320px] md:min-h-[560px]"
            style={{ backgroundColor: "#F4F4F2" }}
          >
            <img
              key={displayImage}
              src={displayImage}
              alt={`${product.name}${selectedColorIdx !== null && product.colorNames?.[selectedColorIdx] ? ` — ${product.colorNames[selectedColorIdx]}` : ""}`}
              className="absolute inset-0 w-full h-full object-contain object-center select-none pointer-events-none"
              draggable={false}
              style={{ transition: "opacity 0.25s ease", backgroundColor: "#6D6E71" }}
            />
            {product.badge && (
              <span className="absolute top-4 left-4 z-[1] px-3 py-1.5 text-xs font-semibold tracking-widest uppercase rounded-full" style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                {product.badge}
              </span>
            )}
          </div>

          <div className="md:col-span-3 p-8 md:p-10 flex flex-col gap-6 overflow-y-auto max-h-[min(92vh,820px)]">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-1 w-6 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>{product.category}</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold leading-none mb-2" style={{ fontFamily: "'Syne', sans-serif" }}>
                {product.name}
              </h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>SKU / {product.code}</p>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {[
                { label: "Fabric", value: product.fabric },
                { label: "Weight", value: product.gsm },
                { label: "Min. Order", value: product.minOrder, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex justify-between items-center px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{label}</span>
                  <span className="text-sm font-semibold" style={{ fontFamily: "'Outfit', sans-serif", color: highlight ? "#0A0A0A" : "var(--foreground)" }}>{value}</span>
                </div>
              ))}
            </div>

            {product.features && (
              <div>
                <p className="text-xs tracking-widest uppercase mb-2 font-semibold" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>Features</p>
                <div className="flex flex-wrap gap-2">
                  {product.features.map((f) => (
                    <span key={f} className="px-3 py-1 text-xs rounded-full" style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif", backgroundColor: "var(--secondary)" }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs tracking-widest uppercase mb-3 font-semibold" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                Select Color{selectedColorIdx !== null && product.colorNames?.[selectedColorIdx] ? ` — ${product.colorNames[selectedColorIdx]}` : ""}
              </p>
              <div className="flex flex-wrap gap-3">
                {product.colors.map((c, i) => {
                  const isSelected = selectedColorIdx === i;
                  return (
                    <button
                      key={`${c}-${i}`}
                      type="button"
                      onClick={() => { setSelectedColorIdx(i); setSelectionError(""); setAdded(false); }}
                      className="flex flex-col items-center gap-1"
                      aria-label={product.colorNames?.[i] || `Color ${i + 1}`}
                      aria-pressed={isSelected}
                    >
                      <div
                        className="w-8 h-8 rounded-full transition-all"
                        style={{
                          backgroundColor: c,
                          border: isSelected ? "2px solid #0A0A0A" : "2px solid rgba(10,10,10,0.1)",
                          boxShadow: isSelected ? "0 0 0 3px var(--accent)" : "none",
                          transform: isSelected ? "scale(1.1)" : "scale(1)",
                        }}
                      />
                      {product.colorNames?.[i] && (
                        <span
                          className="text-xs text-center leading-tight"
                          style={{
                            color: isSelected ? "#0A0A0A" : "var(--muted-foreground)",
                            fontFamily: "'Outfit', sans-serif",
                            fontSize: "9px",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {product.colorNames[i]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs tracking-widest uppercase mb-3 font-semibold" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                Select Size{selectedSize ? ` — ${selectedSize}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s) => {
                  const isSelected = selectedSize === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSelectedSize(s); setSelectionError(""); setAdded(false); }}
                      className="px-3.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 rounded-full"
                      aria-pressed={isSelected}
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        border: isSelected ? "1px solid #0A0A0A" : "1px solid var(--border)",
                        backgroundColor: isSelected ? "var(--accent)" : "var(--secondary)",
                        color: "#0A0A0A",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto pt-6" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs tracking-widest uppercase mb-3 font-semibold" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                Order Quantity ({MIN_ORDER_QTY}–{MAX_ORDER_QTY} pcs)
              </p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setQty((q) => clamp(q - QTY_STEP))}
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-full"
                  style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={MIN_ORDER_QTY}
                  max={MAX_ORDER_QTY}
                  step={QTY_STEP}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || MIN_ORDER_QTY)}
                  onBlur={(e) => setQty(clamp(Number(e.target.value) || MIN_ORDER_QTY))}
                  className="w-24 text-center text-sm font-semibold py-2.5 rounded-full"
                  style={{ fontFamily: "'Outfit', sans-serif", border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <button
                  onClick={() => setQty((q) => clamp(q + QTY_STEP))}
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-full"
                  style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
                  aria-label="Increase quantity"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>pieces</span>
              </div>

              {selectionError && (
                <p className="text-xs mb-3" style={{ color: "#E07A5F", fontFamily: "'Outfit', sans-serif" }}>
                  {selectionError}
                </p>
              )}

              {added && canAdd && (
                <div
                  className="flex items-start gap-3 px-4 py-3 mb-4 rounded-2xl"
                  style={{ backgroundColor: "rgba(212,255,0,0.25)", border: "1px solid rgba(212,255,0,0.8)" }}
                  role="status"
                >
                  <Check size={16} style={{ color: "#0A0A0A", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#0A0A0A" }}>Added to cart</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                      {product.colorNames?.[selectedColorIdx!] || product.colors[selectedColorIdx!]} · Size {selectedSize} · {clamp(qty)} pcs
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <button onClick={handleAdd} style={ctaStyle} className="hover:opacity-85">
                  {added ? <Check size={14} /> : <ShoppingBag size={14} />}
                  {added ? "Added to Cart" : "Add to Cart"}
                </button>
                <button
                  onClick={onOpenCart}
                  className="flex items-center justify-center gap-2 px-[30px] py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
                  style={{ border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'Outfit', sans-serif" }}
                >
                  View Cart & Place Order
                </button>
              </div>

              <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>Or reach us directly to discuss pricing, custom colors, or bulk quotes.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  <Phone size={14} /> +92 330 3834478
                </a>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80" style={{ border: "1px solid #25D366", color: "#128C7E" }}>
                  <MessageCircle size={14} /> WhatsApp
                </a>
                <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  <Mail size={14} /> Email Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({
  cart,
  onClose,
  onUpdateQuantity,
  onRemove,
  onClearCart,
}: {
  cart: CartItem[];
  onClose: () => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
  onClearCart: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const totalPieces = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePlaceOrder = () => {
    const url = buildWhatsAppOrderUrl(cart, { name, company, notes });
    window.open(url, "_blank", "noopener,noreferrer");
    onClearCart();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ backgroundColor: "rgba(10,10,10,0.4)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-y-auto flex flex-col"
        style={{ backgroundColor: "var(--card)", borderLeft: "1px solid var(--border)", boxShadow: "-12px 0 40px rgba(10,10,10,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: "var(--accent)" }} />

        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={18} style={{ color: "#0A0A0A" }} />
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>Your Cart</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
          >
            <X size={15} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag size={32} style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Your cart is empty. Open any product and add it to your order.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 px-6 py-5 flex flex-col gap-4">
              {cart.map((item) => (
                <div key={item.lineId} className="flex gap-3 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="relative flex-shrink-0">
                    <img
                      src={item.image || item.product.image}
                      alt={item.product.name}
                      className="w-16 h-20 object-cover rounded-xl"
                    />
                    <span
                      className="absolute bottom-1 left-1 w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: item.color, border: "1px solid rgba(255,255,255,0.8)" }}
                      title={item.colorName || item.color}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{item.product.name}</p>
                    <p className="text-xs mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                      {item.product.code}
                    </p>
                    <p className="text-xs mb-2 font-medium" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>
                      {item.colorName || item.color} · Size {item.size}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity - QTY_STEP)}
                        className="w-7 h-7 flex items-center justify-center flex-shrink-0 rounded-full"
                        style={{ border: "1px solid var(--border)" }}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={11} />
                      </button>
                      <input
                        type="number"
                        min={MIN_ORDER_QTY}
                        max={MAX_ORDER_QTY}
                        step={QTY_STEP}
                        value={item.quantity}
                        onChange={(e) => onUpdateQuantity(item.lineId, Number(e.target.value) || MIN_ORDER_QTY)}
                        className="w-16 text-center text-xs font-semibold py-1.5 rounded-full"
                        style={{ fontFamily: "'Outfit', sans-serif", border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                      />
                      <button
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity + QTY_STEP)}
                        className="w-7 h-7 flex items-center justify-center flex-shrink-0 rounded-full"
                        style={{ border: "1px solid var(--border)" }}
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        onClick={() => onRemove(item.lineId)}
                        className="ml-auto w-7 h-7 flex items-center justify-center flex-shrink-0 hover:opacity-70 rounded-full"
                        style={{ color: "var(--muted-foreground)" }}
                        aria-label="Remove from cart"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-3 pt-1">
                <p className="text-xs tracking-widest uppercase font-semibold" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
                  Your Details (optional)
                </p>
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-full"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <input
                  type="text"
                  placeholder="Company / City"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-full"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <textarea
                  placeholder="Notes (delivery timeline, custom requests...)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full text-sm px-4 py-2.5 resize-none rounded-2xl"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
              </div>
            </div>

            <div className="px-6 py-5 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Total pieces</span>
                <span className="text-lg font-bold" style={{ fontFamily: "'Syne', sans-serif", color: "#0A0A0A" }}>{totalPieces}</span>
              </div>
              <button
                onClick={handlePlaceOrder}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-85"
                style={{ ...ctaStyle, backgroundColor: "#25D366", color: "#0A0A0A", width: "100%" }}
              >
                <MessageCircle size={16} /> Place Order on WhatsApp
              </button>
              <button
                onClick={onClearCart}
                className="w-full text-xs mt-3 hover:opacity-70 transition-opacity"
                style={{ color: "var(--muted-foreground)" }}
              >
                Clear cart
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AA Logo mark ─────────────────────────────────────────
function AALogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="var(--accent)" />
      <path d="M8 26L14 10H18L13 26H8Z" fill="#0A0A0A" />
      <path d="M14 10H18L24 26H20L14 10Z" fill="#0A0A0A" opacity="0.55" />
      <path d="M20 26L26 10H30L25 26H20Z" fill="#0A0A0A" />
      <path d="M10.5 19H19.5" stroke="#0A0A0A" strokeWidth="1.4" />
      <path d="M22 19H28.5" stroke="#0A0A0A" strokeWidth="1.4" />
    </svg>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selected, setSelected] = useState<Product | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { products: PRODUCTS } = useProducts();
  const { cart, addToCart, updateQuantity, removeFromCart, clearCart } = useCart();

  const filtered = activeCategory === "All" ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeCategory);

  const scrollToCatalog = () => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: "var(--background)", fontFamily: "'Outfit', sans-serif", color: "var(--foreground)" }}>

      {/* ─── HEADER ─── */}
      <header
        className="fixed top-0 left-0 right-0 z-40"
        style={{ backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-4 px-5 md:px-10 h-[68px] md:h-[76px]">
          <button
            type="button"
            onClick={() => { setActiveCategory("All"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="flex items-center gap-2.5 flex-shrink-0 min-w-0"
            aria-label={`${BRAND} home`}
          >
            <AALogo size={34} />
            <span
              className="whitespace-nowrap font-bold"
              style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.15rem", letterSpacing: "-0.02em", color: "#0A0A0A" }}
            >
              AYAN <span style={{ fontWeight: 800 }}>apparels</span>
            </span>
          </button>

          <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 max-w-2xl mx-2">
            {(
              [
                { label: "POLO", cat: "Polo Shirts" as Category, badge: null },
                { label: "POLO SUITS", cat: "Complete Polo Suits" as Category, badge: "NEW" },
                { label: "TROUSERS", cat: "Men's Trousers" as Category, badge: null },
                { label: "ROUND NECK", cat: "Round Neck T-Shirts" as Category, badge: null },
                { label: "MANDARIN", cat: "Mandarin Shirts" as Category, badge: null },
              ]
            ).map(({ label, cat, badge }) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setActiveCategory(cat); scrollToCatalog(); }}
                  className="relative px-4 py-2 text-[11px] tracking-[0.14em] uppercase transition-colors whitespace-nowrap"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: active ? 600 : 500,
                    color: active ? "#0A0A0A" : "rgba(10,10,10,0.55)",
                  }}
                >
                  {badge && (
                    <span
                      className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-[1px] text-[8px] font-bold tracking-wider text-white rounded-full"
                      style={{ backgroundColor: "#0A0A0A" }}
                    >
                      {badge}
                    </span>
                  )}
                  {label}
                  {active && (
                    <span className="absolute left-4 right-4 bottom-0.5 h-[2px] rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={scrollToCatalog}
              className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full transition-opacity hover:opacity-70"
              style={{ color: "#0A0A0A" }}
              aria-label="Search catalog"
            >
              <Search size={18} strokeWidth={1.7} />
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex items-center justify-center w-10 h-10 rounded-full transition-opacity hover:opacity-70"
              style={{ color: "#0A0A0A" }}
              aria-label="Open cart"
            >
              <ShoppingBag size={18} strokeWidth={1.7} />
              {cart.length > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold rounded-full"
                  style={{ backgroundColor: "var(--accent)", color: "#0A0A0A" }}
                >
                  {cart.length}
                </span>
              )}
            </button>

            <a
              href="tel:+923303834478"
              className="hidden md:flex items-center justify-center w-10 h-10 rounded-full transition-opacity hover:opacity-70"
              style={{ color: "#0A0A0A" }}
              aria-label="Call us"
            >
              <User size={18} strokeWidth={1.7} />
            </a>

            <button
              type="button"
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-full"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{ border: "1px solid var(--border)", color: "#0A0A0A" }}
            >
              {menuOpen ? (
                <X size={16} strokeWidth={1.6} />
              ) : (
                <div className="flex flex-col gap-1.5 items-end">
                  <span className="block w-4 h-px" style={{ backgroundColor: "#0A0A0A" }} />
                  <span className="block w-3 h-px" style={{ backgroundColor: "#0A0A0A" }} />
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-30 pt-[76px] px-6 pb-10 flex flex-col overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => { setActiveCategory(cat); setMenuOpen(false); scrollToCatalog(); }}
              className="text-left text-2xl font-bold py-4 flex items-center justify-between"
              style={{
                fontFamily: "'Syne', sans-serif",
                borderBottom: "1px solid var(--border)",
                color: activeCategory === cat ? "#0A0A0A" : "rgba(10,10,10,0.55)",
              }}
            >
              {cat} <ChevronRight size={16} style={{ color: "var(--accent)" }} />
            </button>
          ))}
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setCartOpen(true); }}
              style={{ ...ctaStyle, width: "100%" }}
            >
              <ShoppingBag size={15} /> View Cart {cart.length > 0 && `(${cart.length})`}
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm font-medium rounded-full"
              style={{ ...ctaStyle, backgroundColor: "#25D366", color: "#0A0A0A" }}
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
            <a
              href="tel:+923303834478"
              className="flex items-center justify-center gap-2 px-[30px] py-3 text-sm font-medium rounded-full"
              style={{ border: "1px solid var(--border)", color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}
            >
              <Phone size={14} /> Call +92 330 3834478
            </a>
          </div>
        </div>
      )}

      {/* ─── HERO ─── */}
      <section className="relative min-h-[100svh] lg:h-[100svh] lg:max-h-[100svh] flex flex-col justify-center pt-[68px] md:pt-[76px] overflow-x-hidden lg:overflow-hidden">
        {/* soft lime atmosphere */}
        <div
          className="pointer-events-none absolute -left-24 top-20 w-[380px] h-[380px] rounded-full blur-3xl opacity-70"
          style={{ background: "radial-gradient(circle, rgba(212,255,0,0.55) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute right-[8%] top-[14%] w-[340px] h-[340px] rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle, rgba(212,255,0,0.4) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute right-[22%] bottom-[6%] w-[240px] h-[240px] rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle, rgba(212,255,0,0.35) 0%, transparent 70%)" }}
        />

        <div className="relative w-full max-w-[1400px] mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-8 lg:gap-6 items-center py-6 lg:py-0 flex-1 min-h-0">
          {/* Left copy */}
          <div className="relative z-10 max-w-xl">
            <AnimateIn delay={0}>
              <h1
                className="text-[2.5rem] sm:text-5xl md:text-6xl lg:text-[3.75rem] xl:text-[4.25rem] font-extrabold leading-[1.05] tracking-tight mb-4 md:mb-5"
                style={{ fontFamily: "'Syne', sans-serif", color: "#0A0A0A" }}
              >
                Best In Style
                <br />
                Collection For You
              </h1>
            </AnimateIn>
            <AnimateIn delay={100}>
              <p className="text-base md:text-lg max-w-md leading-relaxed mb-7" style={{ color: "var(--muted-foreground)" }}>
                We craft apparel that sells — premium polos, oversized tees, hoodies & more, built from years of wholesale manufacturing experience.
              </p>
            </AnimateIn>
            <AnimateIn delay={180}>
              <button onClick={scrollToCatalog} style={ctaStyle} className="hover:opacity-85 active:scale-[0.98]">
                Pre-order Now
              </button>
            </AnimateIn>

            <AnimateIn delay={280}>
              <div className="mt-8 md:mt-10 flex items-start gap-3">
                <div className="w-1 self-stretch rounded-full mt-1" style={{ backgroundColor: "var(--accent)", minHeight: 42 }} />
                <div>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Top Comfort</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif", color: "#0A0A0A" }}>Premium Fit</p>
                </div>
              </div>
            </AnimateIn>
          </div>

          {/* Right product visual */}
          <div className="relative z-10 flex items-center justify-center w-full h-full min-h-[400px] lg:min-h-0">
            <div
              className="absolute w-[95%] max-w-[640px] aspect-square rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(212,255,0,0.62) 0%, rgba(212,255,0,0.16) 42%, transparent 70%)",
              }}
            />
            <div
              className="absolute w-[86%] max-w-[560px] aspect-square rounded-full border border-dashed opacity-35"
              style={{ borderColor: "rgba(10,10,10,0.22)", animation: "spin 48s linear infinite" }}
            />
            <span className="absolute w-3 h-3 rounded-full border-2 border-white bg-transparent shadow-sm" style={{ top: "10%", right: "14%" }} />
            <span className="absolute w-2.5 h-2.5 rounded-full border-2 border-white bg-transparent" style={{ bottom: "18%", left: "10%" }} />
            <span className="absolute w-2 h-2 rounded-full border-2 border-white bg-transparent" style={{ top: "36%", left: "6%" }} />

            <img
              src={HERO_CLOTHING}
              alt="AYAN apparels ribbed polo"
              className="relative z-10 w-[min(100%,540px)] h-[min(78svh,660px)] object-contain object-center select-none pointer-events-none drop-shadow-2xl"
              draggable={false}
              style={{
                filter: "drop-shadow(0 28px 48px rgba(10,10,10,0.22))",
              }}
            />

            {/* floating metric */}
            <div
              className="absolute bottom-[6%] right-[0%] md:right-[2%] z-20 flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ backgroundColor: "rgba(255,255,255,0.94)", border: "1px solid var(--border)", boxShadow: "0 12px 40px rgba(10,10,10,0.08)" }}
            >
              <div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Wholesale Ready</p>
                <p className="text-2xl font-extrabold leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>98%</p>
              </div>
              <div className="relative w-11 h-11">
                <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#EFEFEA" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#D4FF00" strokeWidth="3" strokeDasharray="94" strokeDashoffset="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-[12%] right-[-2%] w-16 h-px hidden md:block" style={{ background: "linear-gradient(90deg, transparent, #D4FF00)" }} />
            <span className="absolute bottom-[11%] -right-2 w-2.5 h-2.5 rounded-full hidden md:block" style={{ backgroundColor: "var(--accent)" }} />
          </div>
        </div>
      </section>

      {/* ─── CATALOG PREVIEW ─── */}
      <section className="px-6 md:px-12 py-16">
        <AnimateIn>
          <div className="flex flex-col md:flex-row gap-10 items-center rounded-3xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)" }}>
            <div className="w-full md:w-72 flex-shrink-0 overflow-hidden" style={{ backgroundColor: "#EAEAE6" }}>
              <ImageWithFallback
                src={catalogImg}
                alt="AYAN apparels 2026 product catalog overview"
                className="w-full object-cover"
                style={{ maxHeight: 320, objectPosition: "top" }}
              />
            </div>
            <div className="flex-1 px-6 md:px-8 py-8 md:py-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-1 w-6 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>Official Catalog</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>
                {BRAND} — 2026
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted-foreground)", maxWidth: 420 }}>
                Our AA collection features polo shirts, complete polo suits with trousers and glasses, mens trousers, round neck tees, and mandarin shirts. Select a color to preview that shade on the garment.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {(["Polo Shirts", "Complete Polo Suits", "Men's Trousers", "Round Neck T-Shirts", "Mandarin Shirts"] as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); scrollToCatalog(); }}
                    className="px-3.5 py-1.5 text-xs tracking-wide transition-colors hover:opacity-80 rounded-full"
                    style={{ border: "1px solid var(--border)", fontFamily: "'Outfit', sans-serif", color: "var(--muted-foreground)", backgroundColor: "#fff" }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button onClick={scrollToCatalog} style={ctaStyle} className="hover:opacity-85">
                Browse Catalog <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </AnimateIn>
      </section>

      {/* ─── CATALOG ─── */}
      <section id="catalog" className="px-6 md:px-12 pb-20">
        <AnimateIn>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-1 w-8 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>Product Catalog</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>Our Collection</h2>
            </div>
            <p className="text-sm max-w-xs" style={{ color: "var(--muted-foreground)" }}>
              {PRODUCTS.length} products across {CATEGORIES.length - 1} categories. Click any item for full specs.
            </p>
          </div>
        </AnimateIn>

        <AnimateIn delay={80}>
          <div className="overflow-x-auto pb-3 mb-8" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-1.5 p-1.5 w-max rounded-full" style={{ backgroundColor: "var(--secondary)" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="whitespace-nowrap px-4 py-2 text-xs tracking-widest uppercase transition-all duration-200 rounded-full font-medium"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    backgroundColor: activeCategory === cat ? "#0A0A0A" : "transparent",
                    color: activeCategory === cat ? "#FFFFFF" : "var(--muted-foreground)",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </AnimateIn>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
          <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filtered.map((product, i) => (
            <AnimateIn key={product.id} delay={Math.min(i * 50, 400)}>
              <ProductCard product={product} onClick={() => setSelected(product)} />
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="relative px-6 md:px-12 py-20 overflow-hidden" style={{ backgroundColor: "var(--secondary)" }}>
        <div
          className="pointer-events-none absolute -right-20 top-0 w-72 h-72 rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle, rgba(212,255,0,0.45) 0%, transparent 70%)" }}
        />
        <div className="relative grid md:grid-cols-3 gap-10">
          {[
            { num: "01", title: "Premium Quality Fabric", desc: "We use high-quality 100% cotton for every garment, ensuring comfort, durability, and colorfastness across all batches." },
            { num: "02", title: "Perfect Stitching", desc: "Free stitching for long-lasting quality. Every seam is inspected before dispatch." },
            { num: "03", title: "Customer Satisfaction", desc: "We value your satisfaction and always deliver on time. Our promise — your quality, your timeline." },
          ].map((item) => (
            <AnimateIn key={item.num}>
              <p className="text-5xl font-extrabold mb-4 leading-none" style={{ fontFamily: "'Syne', sans-serif", color: "var(--accent)" }}>{item.num}</p>
              <h4 className="text-xl font-bold mb-3" style={{ fontFamily: "'Syne', sans-serif" }}>{item.title}</h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{item.desc}</p>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ─── ORDER INFO ─── */}
      <section className="px-6 md:px-12 py-16" style={{ borderTop: "1px solid var(--border)" }}>
        <AnimateIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>Order Information</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "MOQ", value: "100 Pcs / Design / Color" },
              { label: "Packing", value: "50 Pcs Per Carton" },
              { label: "Payment", value: "30% Advance · 70% Before Shipment" },
              { label: "Shipping", value: "Air / Sea — 48hr to Prepare" },
            ].map(({ label, value }) => (
              <div key={label} className="p-5 rounded-2xl" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card)" }}>
                <p className="text-xs tracking-widest uppercase mb-2 font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>{label}</p>
                <p className="text-sm leading-snug" style={{ color: "var(--muted-foreground)" }}>{value}</p>
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden px-6 md:px-12 py-24 flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 15% 50%, rgba(212,255,0,0.22) 0%, transparent 55%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs tracking-widest uppercase font-semibold" style={{ color: "#0A0A0A", fontFamily: "'Outfit', sans-serif" }}>Get In Touch</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>
            Ready to<br /><span style={{ backgroundColor: "var(--accent)", padding: "0 8px" }}>place an order?</span>
          </h2>
        </div>
        <div className="relative flex flex-col gap-3 min-w-[270px]">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-medium transition-opacity hover:opacity-85" style={{ ...ctaStyle, backgroundColor: "#25D366", color: "#0A0A0A" }}>
            <MessageCircle size={15} />
            <div>
              <div className="text-xs opacity-70 mb-0.5 font-normal">Chat on WhatsApp</div>
              +92 330 3834478
            </div>
            <ArrowUpRight size={13} className="ml-auto" />
          </a>
          <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-medium transition-opacity hover:opacity-85" style={ctaStyle}>
            <Phone size={15} />
            <div>
              <div className="text-xs opacity-70 mb-0.5 font-normal">Call us directly</div>
              +92 330 3834478
            </div>
            <ArrowUpRight size={13} className="ml-auto" />
          </a>
          <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-[30px] py-3 text-sm font-medium transition-opacity hover:opacity-85 rounded-full" style={{ border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'Outfit', sans-serif" }}>
            <Mail size={15} />
            <div>
              <div className="text-xs mb-0.5 font-normal" style={{ color: "var(--muted-foreground)" }}>Email for bulk quotes</div>
              ayanakber85@gmail.com
            </div>
          </a>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <AALogo size={28} />
          <span className="text-base font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>
            AYAN <span style={{ fontWeight: 800 }}>apparels</span>
          </span>
        </div>
        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)", fontFamily: "'Outfit', sans-serif" }}>
          © 2026 {BRAND} · Premium T-Shirts Manufacturer & Exporter · All Rights Reserved
        </p>
        <div className="flex items-center gap-4 text-xs" style={{ fontFamily: "'Outfit', sans-serif", color: "var(--muted-foreground)" }}>
          <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">+92 330 3834478</a>
          <span>|</span>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity inline-flex items-center gap-1" style={{ color: "#128C7E" }}>
            <MessageCircle size={12} /> WhatsApp
          </a>
          <span>|</span>
          <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">ayanakber85@gmail.com</a>
        </div>
      </footer>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {selected && (
        <ProductModal
          key={selected.id}
          product={selected}
          onClose={() => setSelected(null)}
          onAddToCart={addToCart}
          onOpenCart={() => { setSelected(null); setCartOpen(true); }}
        />
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onClearCart={clearCart}
        />
      )}
    </div>
  );
}
