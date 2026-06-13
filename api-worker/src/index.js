export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/playlist" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM playlist ORDER BY createdAt ASC").all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path === "/playlist" && request.method === "POST") {
        const data = await request.json();
        const sql = `INSERT INTO playlist (id, title, artist, audio, cover, lyricsData, createdAt, syncOffset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        await env.DB.prepare(sql).bind(
          data.id, data.title, data.artist, data.audio, data.cover, data.lyricsData, data.createdAt || Date.now(), data.syncOffset || 0
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === "/playlist" && request.method === "PUT") {
        const data = await request.json();
        const sql = `UPDATE playlist SET title=?, artist=?, audio=?, cover=?, lyricsData=?, syncOffset=? WHERE id=?`;
        await env.DB.prepare(sql).bind(
          data.title, data.artist, data.audio, data.cover, data.lyricsData, data.syncOffset || 0, data.id
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith("/playlist/") && request.method === "DELETE") {
        const id = path.split("/").pop();
        await env.DB.prepare("DELETE FROM playlist WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === "/reset" && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM playlist").run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      
      if (path === "/init" && request.method === "POST") {
          const createTableSQL = `
              CREATE TABLE IF NOT EXISTS playlist (
                  id TEXT PRIMARY KEY,
                  title TEXT,
                  artist TEXT,
                  audio TEXT,
                  cover TEXT,
                  lyricsData TEXT,
                  createdAt INTEGER,
                  syncOffset REAL
              )
          `;
          await env.DB.prepare(createTableSQL).run();
          return Response.json({ success: true, message: "Table initialized" }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
  },
};
