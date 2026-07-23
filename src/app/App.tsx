import { useState, useEffect, useRef } from "react";
import { Phone, Mail, X, ArrowUpRight, ChevronRight, ShoppingBag, Plus, Minus, Trash2, MessageCircle, Check } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import catalogImg from "@/imports/WhatsApp_Image_2026-07-24_at_12.46.44_AM.jpeg";

const CATEGORIES = [
  "All",
  "Polo T-Shirts",
  "Oversized T-Shirts",
  "Round Neck T-Shirts",
  "Hooded T-Shirts",
  "Graphic Print",
  "Acid Wash / Vintage",
  "Shirts",
  "Pants",
  "Trousers",
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
}

const CART_STORAGE_KEY = "ayan-apparel-cart-v2";

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
      }));
  } catch {
    return [];
  }
}

// ─── Load products from /public/products.csv ───────────────
// Edit that CSV file to add, remove, or update products — no code changes needed.
// For fields that hold multiple values (colors, colorNames, sizes, features),
// separate each value with a pipe "|" character inside that cell.
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
      sizes: splitPipe(get("sizes")),
      image: get("image"),
      badge: get("badge") || undefined,
      features: splitPipe(get("features")),
    };
  });
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
    setCart((prev) => {
      const existing = prev.find((item) => item.lineId === lineId);
      if (existing) {
        const merged = Math.min(MAX_ORDER_QTY, existing.quantity + quantity);
        return prev.map((item) => (item.lineId === lineId ? { ...item, quantity: merged } : item));
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
    "Hello AYAN APPAREL! I'd like to place a wholesale order:",
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
  // ── Polo T-Shirts ────────────────────────────────────
  {
    id: 1,
    name: "Classic Polo",
    code: "AC-PL-001",
    category: "Polo T-Shirts",
    fabric: "100% Cotton Piqué",
    gsm: "240-260 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F0EDE8", "#1A1714", "#1E3056", "#2D6A3F", "#8A8A8A", "#C4A882"],
    colorNames: ["White", "Black", "Navy", "Bottle Green", "Light Grey", "Beige"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1602810320073-1230c46d89d4?w=700&h=900&fit=crop&auto=format",
    badge: "Bestseller",
    features: ["Smart Fit", "Shrink Resistant", "Tipped Collar & Sleeve", "Elegant Look"],
  },
  {
    id: 2,
    name: "Premium Polo",
    code: "AC-PL-002",
    category: "Polo T-Shirts",
    fabric: "Cotton-Polyester Blend",
    gsm: "240-260 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F0EDE8", "#1A1714", "#1E3056", "#2D4A22", "#8A8A8A"],
    colorNames: ["White", "Black", "Navy", "Forest", "Grey"],
    sizes: ["S", "M", "L", "XL", "XXL", "XXXL"],
    image: "https://images.unsplash.com/photo-1621198059871-0d5f9b449233?w=700&h=900&fit=crop&auto=format",
    badge: "New",
  },
  // ── Oversized T-Shirts ───────────────────────────────
  {
    id: 3,
    name: "Oversized Plain Tee",
    code: "AC-OS-001",
    category: "Oversized T-Shirts",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F5F5F0", "#1A1714", "#C4A882", "#4A5240", "#1E3056", "#4A4A4A"],
    colorNames: ["Optic White", "Jet Black", "Sand Beige", "Olive Green", "Navy Blue", "Charcoal Grey"],
    sizes: ["S", "M", "L", "XL", "XXL", "XXXL"],
    image: "https://images.unsplash.com/photo-1722310752951-4d459d28c678?w=700&h=900&fit=crop&auto=format",
    badge: "2026 Collection",
    features: ["Oversized Fit", "Pre Shrunk Fabric", "Bio Washed", "Ribbed Neck", "Fade Resistant"],
  },
  {
    id: 4,
    name: "Oversized Drop Shoulder",
    code: "AC-OS-002",
    category: "Oversized T-Shirts",
    fabric: "100% Combed Cotton",
    gsm: "260-280 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F5F5F0", "#1A1714", "#C4A882", "#4A4A4A"],
    colorNames: ["White", "Black", "Beige", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=700&h=900&fit=crop&auto=format",
    features: ["Drop Shoulder Cut", "Heavy Weight", "Boxy Fit", "Double Stitched"],
  },
  // ── Round Neck T-Shirts ──────────────────────────────
  {
    id: 5,
    name: "Essential Crew Tee",
    code: "AC-RN-001",
    category: "Round Neck T-Shirts",
    fabric: "Combed Cotton",
    gsm: "180 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F0EDE8", "#1A1714", "#E8E8E8", "#B5C4D1", "#C8A96A", "#A85555"],
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1651761179569-4ba2aa054997?w=700&h=900&fit=crop&auto=format",
    badge: "High Demand",
  },
  {
    id: 6,
    name: "Heavy Round Neck Tee",
    code: "AC-RN-002",
    category: "Round Neck T-Shirts",
    fabric: "100% Ringspun Cotton",
    gsm: "220 GSM",
    minOrder: "100 pcs / color",
    colors: ["#F0EDE8", "#2C4A8C", "#1A1714", "#4A6741", "#8B4513"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=700&h=900&fit=crop&auto=format",
  },
  // ── Hooded T-Shirts ─────────────────────────────────
  {
    id: 7,
    name: "Hooded T-Shirt",
    code: "AC-HD-001",
    category: "Hooded T-Shirts",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / color",
    colors: ["#1A1714", "#6B6B6B", "#C4A882"],
    colorNames: ["Black", "Grey Melange", "Sand Beige"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1636923611438-8fd1e53ed06c?w=700&h=900&fit=crop&auto=format",
    badge: "New",
    features: ["Hooded Design", "Premium Drawstrings", "Side Pocket Detail"],
  },
  {
    id: 8,
    name: "Pullover Hoodie",
    code: "AC-HD-002",
    category: "Hooded T-Shirts",
    fabric: "Cotton-Fleece Blend",
    gsm: "280-300 GSM",
    minOrder: "50 pcs / color",
    colors: ["#1A1714", "#4A4A4A", "#2C3E50", "#4A6741"],
    colorNames: ["Black", "Charcoal", "Navy", "Olive"],
    sizes: ["S", "M", "L", "XL", "XXL", "XXXL"],
    image: "https://images.unsplash.com/photo-1581655353466-d5ad6765dd37?w=700&h=900&fit=crop&auto=format",
  },
  // ── Graphic Print ────────────────────────────────────
  {
    id: 9,
    name: "Urban Vibes Graphic Tee",
    code: "AC-GP-001",
    category: "Graphic Print",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / design",
    colors: ["#F5F5F0", "#1A1714", "#C4A882"],
    colorNames: ["White Base", "Black Base", "Beige Base"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1635650804060-bb009bcb2ea5?w=700&h=900&fit=crop&auto=format",
    badge: "2026 Drop",
    features: ["High Definition Print", "Long Lasting Colors", "Crack Resistant", "Soft & Comfortable"],
  },
  {
    id: 10,
    name: "Dream Big Graphic Tee",
    code: "AC-GP-002",
    category: "Graphic Print",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / design",
    colors: ["#F5F5F0", "#1A1714"],
    colorNames: ["White Base", "Black Base"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1523585298601-d46ae038d7d3?w=700&h=900&fit=crop&auto=format",
    badge: "Popular",
  },
  {
    id: 11,
    name: "Mind Over Matter Tee",
    code: "AC-GP-003",
    category: "Graphic Print",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / design",
    colors: ["#F5F5F0", "#1A1714", "#4A4A4A"],
    colorNames: ["White", "Black", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1689044611227-3267fabaf76a?w=700&h=900&fit=crop&auto=format",
  },
  // ── Acid Wash / Vintage ──────────────────────────────
  {
    id: 12,
    name: "Vintage Acid Wash Tee",
    code: "AC-AW-001",
    category: "Acid Wash / Vintage",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / color",
    colors: ["#2A2A2A", "#5C4A3A", "#2C3E5A"],
    colorNames: ["Vintage Black", "Vintage Brown", "Vintage Blue"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1586583903558-bf4ae02b9f29?w=700&h=900&fit=crop&auto=format",
    badge: "Unique",
    features: ["Acid Wash Effect", "Soft Hand Feel", "Premium Stitching", "Each Piece is Unique"],
  },
  {
    id: 13,
    name: "Distressed Vintage Tee",
    code: "AC-AW-002",
    category: "Acid Wash / Vintage",
    fabric: "100% Cotton",
    gsm: "240-280 GSM",
    minOrder: "100 pcs / color",
    colors: ["#2A2A2A", "#5C4A3A"],
    colorNames: ["Vintage Black", "Vintage Brown"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1628259748819-9bc7c7417fbb?w=700&h=900&fit=crop&auto=format",
  },
  // ── Shirts ───────────────────────────────────────────
  {
    id: 14,
    name: "Oxford Shirt",
    code: "AC-SH-001",
    category: "Shirts",
    fabric: "Oxford Weave Cotton",
    gsm: "130 GSM",
    minOrder: "30 pcs / color",
    colors: ["#F0EDE8", "#A8C4E0", "#F5E6C8", "#C8D4C0"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1602810316693-3667c854239a?w=700&h=900&fit=crop&auto=format",
    badge: "Premium",
  },
  {
    id: 15,
    name: "Poplin Formal Shirt",
    code: "AC-SH-002",
    category: "Shirts",
    fabric: "100% Cotton Poplin",
    gsm: "120 GSM",
    minOrder: "30 pcs / color",
    colors: ["#F0EDE8", "#1A1714", "#D4E4F0", "#F5E0E0"],
    sizes: ["S", "M", "L", "XL", "XXL", "XXXL"],
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=700&h=900&fit=crop&auto=format",
  },
  // ── Pants ────────────────────────────────────────────
  {
    id: 16,
    name: "Slim Chino",
    code: "AC-PT-001",
    category: "Pants",
    fabric: "98% Cotton, 2% Elastane",
    gsm: "280 GSM",
    minOrder: "30 pcs / color",
    colors: ["#C8A96A", "#1A1714", "#8B6914", "#4A4A4A", "#EDE9E4"],
    sizes: ["28", "30", "32", "34", "36", "38"],
    image: "https://images.unsplash.com/photo-1624378440070-950d99e25830?w=700&h=900&fit=crop&auto=format",
    badge: "Popular",
  },
  {
    id: 17,
    name: "Classic Jogger",
    code: "AC-PT-002",
    category: "Pants",
    fabric: "French Terry Cotton",
    gsm: "260 GSM",
    minOrder: "30 pcs / color",
    colors: ["#1A1714", "#4A4A4A", "#2C3E50", "#5C4A3A"],
    sizes: ["28", "30", "32", "34", "36", "38", "40"],
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=700&h=900&fit=crop&auto=format",
  },
  // ── Trousers ─────────────────────────────────────────
  {
    id: 18,
    name: "Slim Fit Trouser",
    code: "AC-TR-001",
    category: "Trousers",
    fabric: "Poly-Viscose Blend",
    gsm: "260 GSM",
    minOrder: "30 pcs / color",
    colors: ["#1A1714", "#4A4A4A", "#2C3E50", "#5C4A3A", "#6B5A3E"],
    sizes: ["28", "30", "32", "34", "36", "38"],
    image: "https://images.unsplash.com/photo-1601679249486-3e2a903f23ee?w=700&h=900&fit=crop&auto=format",
    badge: "New",
  },
  {
    id: 19,
    name: "Formal Dress Trouser",
    code: "AC-TR-002",
    category: "Trousers",
    fabric: "Premium Wool-Blend",
    gsm: "300 GSM",
    minOrder: "30 pcs / color",
    colors: ["#1A1714", "#3A3530", "#2C3E50", "#4A4035"],
    sizes: ["28", "30", "32", "34", "36", "38", "40"],
    image: "https://images.unsplash.com/photo-1711443813147-def27861b9af?w=700&h=900&fit=crop&auto=format",
    badge: "Premium",
  },
];

const STATS = [
  { value: "500+", label: "Satisfied Clients" },
  { value: "10K+", label: "Units Shipped" },
  { value: "10", label: "Product Categories" },
  { value: "48hr", label: "Sample Turnaround" },
];

function useInView(ref: React.RefObject<Element>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold: 0.12 });
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
  return (
    <article
      className="group cursor-pointer relative flex flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--card)",
        border: `1px solid ${hovered ? "var(--accent)" : "var(--border)"}`,
        transition: "border-color 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: "3/4", backgroundColor: "#1A1714" }}>
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
          style={{
            transition: "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)",
            transform: hovered ? "scale(1.08)" : "scale(1)",
            filter: "brightness(0.85)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: hovered
              ? "linear-gradient(to top, rgba(201,168,76,0.22) 0%, transparent 55%)"
              : "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 55%)",
            transition: "background 0.4s ease",
          }}
        />
        {product.badge && (
          <div
            className="absolute top-0 left-0 px-2.5 py-1 text-xs font-semibold tracking-widest uppercase"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'DM Mono', monospace" }}
          >
            {product.badge}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ fontFamily: "'DM Mono', monospace", color: "rgba(201,168,76,0.85)" }}>
            {product.code}
          </p>
          <h3 className="text-lg font-light leading-tight text-white" style={{ fontFamily: "'Cormorant', serif" }}>
            {product.name}
          </h3>
        </div>
        <div
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center"
          style={{
            backgroundColor: "var(--accent)",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "scale(1)" : "scale(0.6)",
            transition: "all 0.3s ease",
          }}
        >
          <ArrowUpRight size={12} color="#0D0B08" />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5">
          {product.colors.slice(0, 5).map((c) => (
            <span key={c} className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c, border: "1px solid rgba(240,237,232,0.2)" }} />
          ))}
          {product.colors.length > 5 && (
            <span className="text-xs ml-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>+{product.colors.length - 5}</span>
          )}
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>{product.gsm}</span>
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
    product.colors.length === 1 ? 0 : null
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      style={{ backgroundColor: "rgba(13,11,8,0.93)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto relative"
        style={{ backgroundColor: "var(--card)", border: "1px solid rgba(201,168,76,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ backgroundColor: "var(--accent)" }} />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center"
          style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
        >
          <X size={15} />
        </button>

        <div className="grid md:grid-cols-5">
          <div className="md:col-span-2 relative" style={{ minHeight: 420, backgroundColor: "#1A1714" }}>
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" style={{ minHeight: 420, filter: "brightness(0.9)" }} />
            {product.badge && (
              <span className="absolute top-0 left-0 px-3 py-1.5 text-xs font-semibold tracking-widest uppercase" style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'DM Mono', monospace" }}>
                {product.badge}
              </span>
            )}
          </div>

          <div className="md:col-span-3 p-8 md:p-10 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-6" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>{product.category}</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-light leading-none mb-2" style={{ fontFamily: "'Cormorant', serif" }}>
                {product.name}
              </h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>SKU / {product.code}</p>
            </div>

            <div style={{ border: "1px solid var(--border)" }}>
              {[
                { label: "Fabric", value: product.fabric },
                { label: "Weight", value: product.gsm },
                { label: "Min. Order", value: product.minOrder, gold: true },
              ].map(({ label, value, gold }) => (
                <div key={label} className="flex justify-between items-center px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{label}</span>
                  <span className="text-sm font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: gold ? "var(--accent)" : "var(--foreground)" }}>{value}</span>
                </div>
              ))}
            </div>

            {product.features && (
              <div>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>Features</p>
                <div className="flex flex-wrap gap-2">
                  {product.features.map((f) => (
                    <span key={f} className="px-2.5 py-1 text-xs" style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
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
                          border: isSelected ? "2px solid var(--accent)" : "2px solid rgba(240,237,232,0.15)",
                          boxShadow: isSelected ? "0 0 0 2px rgba(201,168,76,0.45)" : "0 0 0 1px rgba(201,168,76,0.25)",
                          transform: isSelected ? "scale(1.1)" : "scale(1)",
                        }}
                      />
                      {product.colorNames?.[i] && (
                        <span
                          className="text-xs text-center leading-tight"
                          style={{
                            color: isSelected ? "var(--accent)" : "var(--muted-foreground)",
                            fontFamily: "'DM Mono', monospace",
                            fontSize: "9px",
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
              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
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
                      className="px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                      aria-pressed={isSelected}
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                        backgroundColor: isSelected ? "rgba(201,168,76,0.18)" : "var(--secondary)",
                        color: isSelected ? "var(--accent)" : "var(--foreground)",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto pt-6" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                Order Quantity ({MIN_ORDER_QTY}–{MAX_ORDER_QTY} pcs)
              </p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setQty((q) => clamp(q - QTY_STEP))}
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0"
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
                  className="w-24 text-center text-sm font-semibold py-2.5"
                  style={{ fontFamily: "'DM Mono', monospace", border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <button
                  onClick={() => setQty((q) => clamp(q + QTY_STEP))}
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                  style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
                  aria-label="Increase quantity"
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>pieces</span>
              </div>

              {selectionError && (
                <p className="text-xs mb-3" style={{ color: "#E07A5F", fontFamily: "'DM Mono', monospace" }}>
                  {selectionError}
                </p>
              )}

              {added && canAdd && (
                <div
                  className="flex items-start gap-3 px-4 py-3 mb-4"
                  style={{ backgroundColor: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.45)" }}
                  role="status"
                >
                  <Check size={16} style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Added to cart</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                      {product.colorNames?.[selectedColorIdx!] || product.colors[selectedColorIdx!]} · Size {selectedSize} · {clamp(qty)} pcs
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <button
                  onClick={handleAdd}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
                >
                  {added ? <Check size={14} /> : <ShoppingBag size={14} />}
                  {added ? "Added to Cart" : "Add to Cart"}
                </button>
                <button
                  onClick={onOpenCart}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  View Cart & Place Order
                </button>
              </div>

              <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>Or reach us directly to discuss pricing, custom colors, or bulk quotes.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-80" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  <Phone size={14} /> +92 330 3834478
                </a>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-80" style={{ border: "1px solid #25D366", color: "#25D366" }}>
                  <MessageCircle size={14} /> WhatsApp
                </a>
                <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-80" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
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
      style={{ backgroundColor: "rgba(13,11,8,0.93)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-y-auto flex flex-col"
        style={{ backgroundColor: "var(--card)", borderLeft: "1px solid rgba(201,168,76,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-0.5 w-full flex-shrink-0" style={{ backgroundColor: "var(--accent)" }} />

        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={18} style={{ color: "var(--accent)" }} />
            <h2 className="text-xl font-light" style={{ fontFamily: "'Cormorant', serif" }}>Your Cart</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center"
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
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-16 h-20 object-cover"
                      style={{ filter: "brightness(0.9)" }}
                    />
                    <span
                      className="absolute bottom-1 left-1 w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: item.color, border: "1px solid rgba(240,237,232,0.5)" }}
                      title={item.colorName || item.color}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.product.name}</p>
                    <p className="text-xs mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                      {item.product.code}
                    </p>
                    <p className="text-xs mb-2" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
                      {item.colorName || item.color} · Size {item.size}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity - QTY_STEP)}
                        className="w-7 h-7 flex items-center justify-center flex-shrink-0"
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
                        className="w-16 text-center text-xs font-semibold py-1.5"
                        style={{ fontFamily: "'DM Mono', monospace", border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                      />
                      <button
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity + QTY_STEP)}
                        className="w-7 h-7 flex items-center justify-center flex-shrink-0"
                        style={{ border: "1px solid var(--border)" }}
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        onClick={() => onRemove(item.lineId)}
                        className="ml-auto w-7 h-7 flex items-center justify-center flex-shrink-0 hover:opacity-70"
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
                <p className="text-xs tracking-widest uppercase" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
                  Your Details (optional)
                </p>
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm px-3 py-2.5"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <input
                  type="text"
                  placeholder="Company / City"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full text-sm px-3 py-2.5"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
                <textarea
                  placeholder="Notes (delivery timeline, custom requests...)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full text-sm px-3 py-2.5 resize-none"
                  style={{ border: "1px solid var(--border)", backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
                />
              </div>
            </div>

            <div className="px-6 py-5 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Total pieces</span>
                <span className="text-lg font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>{totalPieces}</span>
              </div>
              <button
                onClick={handlePlaceOrder}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ backgroundColor: "#25D366", color: "#0D0B08" }}
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
      <path d="M4 30L11 8H15L10 30H4Z" fill="var(--accent)" />
      <path d="M11 8H15L22 30H16L11 8Z" fill="var(--foreground)" />
      <path d="M20 30L27 8H31L26 30H20Z" fill="var(--accent)" />
      <path d="M27 8H31L38 30H32L27 8Z" fill="var(--foreground)" />
      <path d="M8 21H18" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M24 21H34" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [selected, setSelected] = useState<Product | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { products: PRODUCTS } = useProducts();
  const { cart, addToCart, updateQuantity, removeFromCart, clearCart, totalPieces } = useCart();

  const filtered = activeCategory === "All" ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeCategory);

  const scrollToCatalog = () => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)", fontFamily: "'Inter', sans-serif", color: "var(--foreground)" }}>

      {/* ─── HEADER ─── */}
      <header
        className="fixed top-0 left-0 right-0 z-40"
        style={{ backgroundColor: "rgba(13,11,8,0.92)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(201,168,76,0.18)" }}
      >
        <div className="flex items-center justify-between gap-4 px-5 md:px-10 h-[64px] md:h-[72px]">
          {/* Brand */}
          <button
            type="button"
            onClick={() => { setActiveCategory("All"); scrollToCatalog(); }}
            className="flex items-center gap-2.5 flex-shrink-0 min-w-0"
            aria-label="AYAN APPAREL home"
          >
            <AALogo size={28} />
            <div className="leading-none text-left">
              <div
                className="uppercase whitespace-nowrap"
                style={{ fontFamily: "'Cormorant', serif", fontSize: "1.05rem", letterSpacing: "0.14em", fontWeight: 500 }}
              >
                AYAN <span style={{ color: "var(--accent)", fontWeight: 600 }}>APPAREL</span>
              </div>
              <div
                className="hidden sm:block mt-1 uppercase"
                style={{ color: "rgba(240,237,232,0.45)", fontSize: "9px", letterSpacing: "0.28em", fontWeight: 400 }}
              >
                Premium T-Shirts
              </div>
            </div>
          </button>

          {/* Nav — short labels, single line */}
          <nav className="hidden xl:flex flex-1 items-center justify-center gap-1 max-w-3xl mx-2">
            {(
              [
                { label: "Polo", cat: "Polo T-Shirts" },
                { label: "Oversized", cat: "Oversized T-Shirts" },
                { label: "Hooded", cat: "Hooded T-Shirts" },
                { label: "Graphics", cat: "Graphic Print" },
                { label: "Acid Wash", cat: "Acid Wash / Vintage" },
              ] as { label: string; cat: Category }[]
            ).map(({ label, cat }) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setActiveCategory(cat); scrollToCatalog(); }}
                  className="relative px-3 py-2 text-[12px] transition-colors whitespace-nowrap"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: active ? 500 : 400,
                    letterSpacing: "0.04em",
                    color: active ? "var(--accent)" : "rgba(240,237,232,0.62)",
                  }}
                >
                  {label}
                  {active && (
                    <span
                      className="absolute left-3 right-3 bottom-0.5 h-px"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex items-center justify-center w-9 h-9 transition-opacity hover:opacity-80"
              style={{ border: "1px solid rgba(240,237,232,0.18)", color: "var(--foreground)" }}
              aria-label="Open cart"
            >
              <ShoppingBag size={15} strokeWidth={1.6} />
              {cart.length > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-semibold rounded-full"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
                >
                  {cart.length}
                </span>
              )}
            </button>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center justify-center w-9 h-9 transition-opacity hover:opacity-80"
              style={{ border: "1px solid rgba(37,211,102,0.45)", color: "#25D366" }}
              aria-label="Chat on WhatsApp"
              title="WhatsApp"
            >
              <MessageCircle size={15} strokeWidth={1.6} />
            </a>

            <a
              href="tel:+923303834478"
              className="hidden md:inline-flex items-center gap-2 h-9 px-3.5 text-[11px] font-medium tracking-[0.08em] uppercase transition-opacity hover:opacity-85 whitespace-nowrap"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'Inter', sans-serif" }}
            >
              <Phone size={12} strokeWidth={1.8} />
              Call
            </a>

            <button
              type="button"
              className="xl:hidden flex items-center justify-center w-9 h-9"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              style={{ border: "1px solid rgba(240,237,232,0.18)", color: "var(--foreground)" }}
            >
              {menuOpen ? (
                <X size={15} strokeWidth={1.6} />
              ) : (
                <div className="flex flex-col gap-1.5 items-end">
                  <span className="block w-4 h-px" style={{ backgroundColor: "var(--foreground)" }} />
                  <span className="block w-3 h-px" style={{ backgroundColor: "var(--foreground)" }} />
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 pt-[72px] px-6 pb-10 flex flex-col overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => { setActiveCategory(cat); setMenuOpen(false); scrollToCatalog(); }}
              className="text-left text-2xl font-light py-4 flex items-center justify-between"
              style={{
                fontFamily: "'Cormorant', serif",
                borderBottom: "1px solid var(--border)",
                color: activeCategory === cat ? "var(--accent)" : "var(--foreground)",
              }}
            >
              {cat} <ChevronRight size={16} style={{ color: "var(--accent)" }} />
            </button>
          ))}
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setCartOpen(true); }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium"
              style={{ border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "'Inter', sans-serif" }}
            >
              <ShoppingBag size={15} /> View Cart {cart.length > 0 && `(${cart.length})`}
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium"
              style={{ border: "1px solid rgba(37,211,102,0.5)", color: "#25D366", fontFamily: "'Inter', sans-serif" }}
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
            <a
              href="tel:+923303834478"
              className="flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", fontFamily: "'Inter', sans-serif" }}
            >
              <Phone size={14} /> Call +92 330 3834478
            </a>
          </div>
        </div>
      )}

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col justify-end overflow-hidden pt-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(201,168,76,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.035) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Hero image panels */}
        <div className="absolute inset-0 grid grid-cols-3 opacity-25 pointer-events-none">
          <img src="https://images.unsplash.com/photo-1602810320073-1230c46d89d4?w=500&h=900&fit=crop&auto=format" alt="" className="w-full h-full object-cover" style={{ filter: "grayscale(30%)" }} />
          <img src="https://images.unsplash.com/photo-1722310752951-4d459d28c678?w=500&h=900&fit=crop&auto=format" alt="" className="w-full h-full object-cover" style={{ filter: "grayscale(30%)" }} />
          <img src="https://images.unsplash.com/photo-1636923611438-8fd1e53ed06c?w=500&h=900&fit=crop&auto=format" alt="" className="w-full h-full object-cover" style={{ filter: "grayscale(30%)" }} />
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(13,11,8,0.35) 0%, rgba(13,11,8,0.55) 35%, rgba(13,11,8,0.98) 100%)" }} />

        <div className="relative px-6 md:px-12 pb-0 pt-32">
          <div className="max-w-5xl">
            <AnimateIn delay={0}>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-px w-8" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>Latest Collection 2026</span>
              </div>
            </AnimateIn>
            <AnimateIn delay={100}>
              <h1 className="text-6xl md:text-8xl lg:text-[7rem] font-light leading-none mb-6" style={{ fontFamily: "'Cormorant', serif", letterSpacing: "-0.02em" }}>
                Clothes
                <br />
                <span className="italic" style={{ color: "var(--accent)" }}>Built</span>{" "}to Sell.
              </h1>
            </AnimateIn>
            <AnimateIn delay={180}>
              <p className="text-base md:text-lg max-w-lg leading-relaxed mb-10" style={{ color: "rgba(240,237,232,0.55)" }}>
                Premium polo shirts, oversized tees, hoodies, graphic prints, acid wash & more — available in bulk at unbeatable wholesale rates.
              </p>
            </AnimateIn>
            <AnimateIn delay={260}>
              <div className="flex flex-wrap gap-4 mb-14">
                <button onClick={scrollToCatalog} className="flex items-center gap-2 px-7 py-4 text-sm font-semibold tracking-wide transition-opacity hover:opacity-80" style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}>
                  Browse Catalog <ArrowUpRight size={15} />
                </button>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-7 py-4 text-sm font-semibold tracking-wide transition-opacity hover:opacity-80" style={{ backgroundColor: "#25D366", color: "#0D0B08" }}>
                  <MessageCircle size={13} /> WhatsApp
                </a>
                <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-7 py-4 text-sm font-semibold tracking-wide transition-opacity hover:opacity-80" style={{ border: "1px solid rgba(240,237,232,0.2)", color: "var(--foreground)" }}>
                  <Phone size={13} /> Call to Order
                </a>
              </div>
            </AnimateIn>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative grid grid-cols-2 md:grid-cols-4" style={{ borderTop: "1px solid var(--border)", backgroundColor: "rgba(18,15,12,0.85)", backdropFilter: "blur(8px)" }}>
          {STATS.map((s, i) => (
            <div key={s.label} className="px-6 py-5 text-center" style={{ borderRight: i < 3 ? "1px solid var(--border)" : undefined }}>
              <p className="text-2xl font-light mb-0.5" style={{ fontFamily: "'Cormorant', serif", color: "var(--accent)" }}>{s.value}</p>
              <p className="text-xs tracking-wider uppercase" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CATALOG PREVIEW (from uploaded image) ─── */}
      <section className="px-6 md:px-12 py-16">
        <AnimateIn>
          <div className="flex flex-col md:flex-row gap-10 items-center" style={{ border: "1px solid var(--border)", padding: "2px" }}>
            <div className="w-full md:w-72 flex-shrink-0 overflow-hidden" style={{ backgroundColor: "#1A1714" }}>
              <ImageWithFallback
                src={catalogImg}
                alt="AYAN APPAREL 2026 product catalog overview"
                className="w-full object-cover"
                style={{ maxHeight: 320, objectPosition: "top" }}
              />
            </div>
            <div className="flex-1 px-4 md:px-8 py-6 md:py-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-6" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>Official Catalog</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-light mb-4" style={{ fontFamily: "'Cormorant', serif" }}>
                AYAN APPAREL — 2026
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted-foreground)", maxWidth: 420 }}>
                Our 2026 collection spans oversized tees, premium polos, graphic prints, acid wash vintage, hooded styles, formal shirts, pants and trousers. Every piece manufactured to wholesale specification — consistent GSM, colorfastness tested, quality checked.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["Polo T-Shirts", "Oversized T-Shirts", "Graphic Print", "Acid Wash / Vintage", "Hooded T-Shirts"] as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); scrollToCatalog(); }}
                    className="px-3 py-1.5 text-xs tracking-wide transition-colors hover:opacity-80"
                    style={{ border: "1px solid var(--border)", fontFamily: "'DM Mono', monospace", color: "var(--muted-foreground)" }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
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
                <div className="h-px w-8" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>Product Catalog</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-light" style={{ fontFamily: "'Cormorant', serif" }}>Our Collection</h2>
            </div>
            <p className="text-sm max-w-xs" style={{ color: "var(--muted-foreground)" }}>
              {PRODUCTS.length} products across {CATEGORIES.length - 1} categories. Click any item for full specs.
            </p>
          </div>
        </AnimateIn>

        {/* Filter tabs — scrollable on mobile */}
        <AnimateIn delay={80}>
          <div className="overflow-x-auto pb-3 mb-8" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-1 p-1 w-max" style={{ backgroundColor: "var(--secondary)" }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="whitespace-nowrap px-3 py-2 text-xs tracking-widest uppercase transition-all duration-200"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    backgroundColor: activeCategory === cat ? "var(--accent)" : "transparent",
                    color: activeCategory === cat ? "var(--accent-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </AnimateIn>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
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
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--foreground) 0, var(--foreground) 1px, transparent 0, transparent 50%)", backgroundSize: "18px 18px" }} />
        <div className="relative grid md:grid-cols-3 gap-10">
          {[
            { num: "01", title: "Premium Quality Fabric", desc: "We use high-quality 100% cotton for every garment, ensuring comfort, durability, and colorfastness across all batches." },
            { num: "02", title: "Perfect Stitching", desc: "Free stitching for long-lasting quality. Every seam is inspected before dispatch." },
            { num: "03", title: "Customer Satisfaction", desc: "We value your satisfaction and always deliver on time. Our promise — your quality, your timeline." },
          ].map((item) => (
            <AnimateIn key={item.num}>
              <p className="text-5xl font-light mb-4 leading-none" style={{ fontFamily: "'Cormorant', serif", color: "var(--accent)", opacity: 0.45 }}>{item.num}</p>
              <h4 className="text-xl font-semibold mb-3" style={{ fontFamily: "'Cormorant', serif" }}>{item.title}</h4>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{item.desc}</p>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ─── ORDER INFO ─── */}
      <section className="px-6 md:px-12 py-16" style={{ borderTop: "1px solid var(--border)" }}>
        <AnimateIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px w-8" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>Order Information</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "MOQ", value: "100 Pcs / Design / Color" },
              { label: "Packing", value: "50 Pcs Per Carton" },
              { label: "Payment", value: "30% Advance · 70% Before Shipment" },
              { label: "Shipping", value: "Air / Sea — 48hr to Prepare" },
            ].map(({ label, value }) => (
              <div key={label} className="p-5" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card)" }}>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>{label}</p>
                <p className="text-sm leading-snug" style={{ color: "var(--foreground)" }}>{value}</p>
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden px-6 md:px-12 py-24 flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 15% 50%, rgba(201,168,76,0.07) 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-8" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>Get In Touch</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-light leading-none" style={{ fontFamily: "'Cormorant', serif" }}>
            Ready to<br /><span className="italic" style={{ color: "var(--accent)" }}>place an order?</span>
          </h2>
        </div>
        <div className="relative flex flex-col gap-3 min-w-[270px]">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-6 py-4 text-sm font-semibold transition-opacity hover:opacity-75" style={{ backgroundColor: "#25D366", color: "#0D0B08" }}>
            <MessageCircle size={15} />
            <div>
              <div className="text-xs opacity-70 mb-0.5 font-normal">Chat on WhatsApp</div>
              +92 330 3834478
            </div>
            <ArrowUpRight size={13} className="ml-auto" />
          </a>
          <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-6 py-4 text-sm font-semibold transition-opacity hover:opacity-75" style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}>
            <Phone size={15} />
            <div>
              <div className="text-xs opacity-70 mb-0.5 font-normal">Call us directly</div>
              +92 330 3834478
            </div>
            <ArrowUpRight size={13} className="ml-auto" />
          </a>
          <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-6 py-4 text-sm font-semibold transition-opacity hover:opacity-75" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
            <Mail size={15} style={{ color: "var(--accent)" }} />
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
          <AALogo size={24} />
          <span className="text-base font-light tracking-widest uppercase" style={{ fontFamily: "'Cormorant', serif" }}>
            AYAN <span className="italic font-semibold" style={{ color: "var(--accent)" }}>APPAREL</span>
          </span>
        </div>
        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)", fontFamily: "'DM Mono', monospace" }}>
          © 2026 AYAN APPAREL · Premium T-Shirts Manufacturer & Exporter · All Rights Reserved
        </p>
        <div className="flex items-center gap-4 text-xs" style={{ fontFamily: "'DM Mono', monospace", color: "var(--muted-foreground)" }}>
          <a href="tel:+923303834478" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">+92 330 3834478</a>
          <span>|</span>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity inline-flex items-center gap-1" style={{ color: "#25D366" }}>
            <MessageCircle size={12} /> WhatsApp
          </a>
          <span>|</span>
          <a href="mailto:ayanakber85@gmail.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">ayanakber85@gmail.com</a>
        </div>
      </footer>

      {selected && (
        <ProductModal
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
