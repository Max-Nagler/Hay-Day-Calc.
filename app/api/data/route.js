export async function GET() {
  return Response.json({
    ok: true,
    message: "API läuft. Notion-Anbindung kommt als Nächstes.",
    syncedAt: new Date().toISOString(),
    products: [],
    recipes: [],
    buildings: [],
    rawProducts: []
  });
}
