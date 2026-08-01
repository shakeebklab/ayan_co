import { removeBackground } from "@imgly/background-removal-node";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const root = "c:/Users/Hp/Downloads/Clothing_Catalog_Cart_WhatsApp";
const src = join(root, "public/products/ringer-navy.jpg");
const dst = join(root, "public/products/hero-tee-navy.png");

const blob = await removeBackground(src, {
  output: { format: "image/png", quality: 0.95 },
});
const buf = Buffer.from(await blob.arrayBuffer());
await writeFile(dst, buf);
console.log("wrote", dst, buf.length);
