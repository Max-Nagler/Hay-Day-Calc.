import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

async function queryAllDatabasePages(databaseId) {
  const allResults = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: startCursor
    });

    allResults.push(...response.results);

    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  return allResults;
}

function getTitleFromProperties(properties) {
  const titleProperty = Object.values(properties).find(
    (property) => property.type === "title"
  );

  if (!titleProperty) return null;

  return titleProperty.title
    .map((part) => part.plain_text)
    .join("")
    .trim();
}

function simplifyPage(page) {
  return {
    id: page.id,
    icon: page.icon,
    url: page.url,
    title: getTitleFromProperties(page.properties),
    properties: page.properties
  };
}

export async function GET() {
  try {
    const mainDatabaseId = process.env.NOTION_MAIN_DATABASE_ID;
    const recipeDatabaseId = process.env.NOTION_RECIPE_DATABASE_ID;

    if (!process.env.NOTION_TOKEN) {
      return Response.json(
        {
          ok: false,
          error: "NOTION_TOKEN fehlt in Vercel."
        },
        { status: 500 }
      );
    }

    if (!mainDatabaseId) {
      return Response.json(
        {
          ok: false,
          error: "NOTION_MAIN_DATABASE_ID fehlt in Vercel."
        },
        { status: 500 }
      );
    }

    if (!recipeDatabaseId) {
      return Response.json(
        {
          ok: false,
          error: "NOTION_RECIPE_DATABASE_ID fehlt in Vercel."
        },
        { status: 500 }
      );
    }

    const [mainPages, recipePages] = await Promise.all([
      queryAllDatabasePages(mainDatabaseId),
      queryAllDatabasePages(recipeDatabaseId)
    ]);

    return Response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      counts: {
        mainDatabase: mainPages.length,
        recipeDatabase: recipePages.length
      },
      mainDatabase: mainPages.map(simplifyPage),
      recipeDatabase: recipePages.map(simplifyPage)
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        ok: false,
        error: error.message ?? "Unbekannter Fehler beim Laden der Notion-Daten."
      },
      { status: 500 }
    );
  }
}
