import { calculateProductionPlan } from "../../../lib/calculator";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const products = Array.isArray(body.products) ? body.products : [];
    const recipes = Array.isArray(body.recipes) ? body.recipes : [];
    const settings = body.settings || {};

    if (!products.length) {
      return Response.json(
        {
          ok: false,
          error: "Keine Produktdaten übergeben."
        },
        { status: 400 }
      );
    }

    const result = calculateProductionPlan({
      products,
      recipes,
      ...settings
    });

    return Response.json({
      ok: true,
      calculatedAt: new Date().toISOString(),
      result
    });
  } catch (error) {
    console.error("Optimize API failed", error);

    return Response.json(
      {
        ok: false,
        error: error.message || "Unbekannter Fehler bei der Optimierung."
      },
      { status: 500 }
    );
  }
}
