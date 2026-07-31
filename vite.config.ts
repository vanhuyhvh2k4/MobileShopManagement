import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Quản Lý Sửa Chữa Điện Thoại",
        short_name: "Quản Lý Điện Thoại",
        description: "Ứng dụng quản lý mua bán, sửa chữa, tồn kho và lợi nhuận điện thoại, ưu tiên dùng ngoại tuyến.",
        theme_color: "#111827",
        background_color: "#f8fafc",
        display: "standalone",
        icons: [
          { src: "/pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-512.svg", sizes: "512x512", type: "image/svg+xml" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
