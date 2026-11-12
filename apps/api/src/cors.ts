/** CORS_ORIGIN: virgülle ayrılmış kökenler (ör. "https://coombie.dracord.com.tr,http://localhost:5173") */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
