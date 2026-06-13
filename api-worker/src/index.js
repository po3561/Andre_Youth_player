export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Playlist
      if (path === '/playlist' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM playlist ORDER BY createdAt ASC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path === '/playlist' && request.method === 'POST') {
        const data = await request.json();
        const sql = "INSERT INTO playlist (id, title, artist, audio, cover, lyricsData, createdAt, syncOffset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        await env.DB.prepare(sql).bind(
          data.id, data.title, data.artist, data.audio, data.cover, data.lyricsData, data.createdAt || Date.now(), data.syncOffset || 0
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/playlist' && request.method === 'PUT') {
        const data = await request.json();
        const sql = "UPDATE playlist SET title=?, artist=?, audio=?, cover=?, lyricsData=?, syncOffset=? WHERE id=?";
        await env.DB.prepare(sql).bind(
          data.title, data.artist, data.audio, data.cover, data.lyricsData, data.syncOffset || 0, data.id
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/playlist/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM playlist WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/reset' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM playlist').run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // Chat
      if (path === '/chat' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM chat ORDER BY timestamp ASC LIMIT 50').all();
        return Response.json(results || [], { headers: corsHeaders });
      }
      if (path === '/chat' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT INTO chat (id, content, timestamp, uid) VALUES (?, ?, ?, ?)').bind(
            data.id, data.content, data.timestamp || Date.now(), data.uid || 'anonymous'
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // Inquiry
      if (path === '/inquiry' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM inquiry ORDER BY timestamp DESC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }
      if (path === '/inquiry' && request.method === 'POST') {
        const data = await request.json();
        await env.DB.prepare('INSERT INTO inquiry (id, title, content, contact, timestamp) VALUES (?, ?, ?, ?, ?)').bind(
            data.id, data.title, data.content, data.contact || '', data.timestamp || Date.now()
        ).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      if (path.startsWith('/inquiry/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM inquiry WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // Settings
      if (path === '/settings' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM settings').all();
        const settingsObj = {};
        if (results) {
            results.forEach(row => settingsObj[row.key] = row.value);
        }
        return Response.json(settingsObj, { headers: corsHeaders });
      }
      if (path === '/settings' && request.method === 'POST') {
        const data = await request.json();
        for (const [key, value] of Object.entries(data)) {
            await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      
      // Users
      if (path === '/users/signup' && request.method === 'POST') {
        const data = await request.json();
        const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(data.id).first();
        if (existing) return Response.json({ success: false, error: 'Already exists' }, { status: 400, headers: corsHeaders });
        
        await env.DB.prepare('INSERT INTO users (id, password, name, isApproved, role, createdAt) VALUES (?, ?, ?, 0, ?, ?)').bind(
            data.id, data.password, data.name || data.id, 'user', Date.now()
        ).run();
        return Response.json({ success: true, message: 'Signup success, waiting approval' }, { headers: corsHeaders });
      }

      if (path === '/users/login' && request.method === 'POST') {
        const data = await request.json();
        // Master Admin Hardcoding Backup
        if (data.id === 'admin' && data.password === '1234') {
            return Response.json({ success: true, user: { id: 'admin', name: 'Master Admin', isApproved: 1, role: 'admin' } }, { headers: corsHeaders });
        }
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND password = ?').bind(data.id, data.password).first();
        if (!user) return Response.json({ success: false, error: 'Invalid ID or Password' }, { status: 401, headers: corsHeaders });
        if (!user.isApproved) return Response.json({ success: false, error: 'Not Approved' }, { status: 403, headers: corsHeaders });
        
        return Response.json({ success: true, user: { id: user.id, name: user.name, isApproved: user.isApproved, role: user.role } }, { headers: corsHeaders });
      }

      if (path === '/users' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, name, isApproved, role, createdAt FROM users ORDER BY createdAt DESC').all();
        return Response.json(results || [], { headers: corsHeaders });
      }

      if (path.startsWith('/users/') && request.method === 'PUT') {
        const id = path.split('/').pop();
        const data = await request.json();
        if (data.action === 'approve') {
            await env.DB.prepare('UPDATE users SET isApproved = 1 WHERE id = ?').bind(id).run();
            return Response.json({ success: true }, { headers: corsHeaders });
        }
      }

      if (path.startsWith('/users/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/init' && request.method === 'POST') {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS playlist (id TEXT PRIMARY KEY, title TEXT, artist TEXT, audio TEXT, cover TEXT, lyricsData TEXT, createdAt INTEGER, syncOffset REAL)").run();
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS chat (id TEXT PRIMARY KEY, content TEXT, timestamp INTEGER, uid TEXT)").run();
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS inquiry (id TEXT PRIMARY KEY, title TEXT, content TEXT, contact TEXT, timestamp INTEGER)").run();
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)").run();
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, password TEXT, name TEXT, isApproved INTEGER, role TEXT, createdAt INTEGER)").run();
          
          await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('mainTitle', 'ANDREW YOUTH'), ('subTitle', '믿음으로 기대하다')").run();

          return Response.json({ success: true, message: 'All tables initialized' }, { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
  },
};
