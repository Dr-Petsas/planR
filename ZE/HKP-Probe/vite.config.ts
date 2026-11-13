import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Oberfläche der Probe auf der Landingpage (planr.pickadoc.de/#probe). Eigener Stand, unabhängig vom HKP-Planer.
// Gemeinsam ist nur der Rechenkern: Berechnung, Preislisten und Typen aus ZE/HKP/src (@kern).
const kern = fileURLToPath(new URL('../HKP/src', import.meta.url))

export default defineConfig({
  base: process.env.PLANR_BASE || '/',
  plugins: [react()],
  // F:\postcss.config.js gehört nicht zum Projekt und darf nicht geerbt werden
  css: { postcss: {} },
  // Listenstand und Favicon kommen aus dem HKP-Planer, damit es nur einen Datenstand gibt
  publicDir: fileURLToPath(new URL('../HKP/public', import.meta.url)),
  resolve: { alias: { '@kern': kern }, dedupe: ['react', 'react-dom'] },
  server: { port: 5182, fs: { allow: ['..'] } },
})
