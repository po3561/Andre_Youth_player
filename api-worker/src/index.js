// --- Security Utils ---
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const JWT_SECRET = "ANDRE_YOUTH_SUPER_SECRET_KEY_2026_!@#";

async function signToken(payload) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const dataToSign = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataToSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${dataToSign}.${sigBase64}`;
}

async function verifyToken(token) {
  try {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [header, body, sigBase64] = parts;
    const dataToVerify = `${header}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBuffer = new Uint8Array(atob(sigBase64).split('').map(c => c.charCodeAt(0)));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBuffer, new TextEncoder().encode(dataToVerify));
    return isValid ? JSON.parse(atob(body)) : false;
  } catch(e) {
    return false;
  }
}

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

    // 미들웨어: 인증 확인 (Authorization Header 파싱)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    const currentUser = await verifyToken(token);

    // 권한이 필요한 라우트 목록 (예: 생성/수정/삭제 등)
    const requiresAdmin = [
        { path: '/playlist', methods: ['POST', 'PUT', 'DELETE'] },
        { path: '/settings', methods: ['POST'] },
        { path: '/upload', methods: ['PUT'] },
        { path: '/reset', methods: ['DELETE'] },
        { path: '/init', methods: ['POST'] }
    ];

    // 인증 제외 경로 (회원가입/로그인은 누구나 접근 가능)
    const publicPaths = ['/users/signup', '/users/login'];
    const isPublic = publicPaths.some(p => path === p);

    // /users/{id} PUT/DELETE는 관리자 전용
    const isUserAdmin = path.startsWith('/users/') && !isPublic && ['PUT', 'DELETE'].includes(request.method);

    const needsAuth = requiresAdmin.some(r => path.startsWith(r.path) && r.methods.includes(request.method)) || isUserAdmin;
    if (needsAuth && !isPublic) {
        if (!currentUser || currentUser.role !== 'admin') {
            return Response.json({ success: false, error: 'Unauthorized: Invalid or missing token' }, { status: 401, headers: corsHeaders });
        }
    }

    try {
      // R2 Upload
      if (path === '/upload' && request.method === 'PUT') {
        const filename = url.searchParams.get('filename');
        if (!filename) return Response.json({ success: false, error: 'filename query missing' }, { status: 400, headers: corsHeaders });
        
        await env.BUCKET.put(filename, request.body);
        const publicUrl = `https://pub-6f09ba73beba48419076ff845f6d3731.r2.dev/${filename}`;
        return Response.json({ success: true, url: publicUrl }, { headers: corsHeaders });
      }

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
        
        const hashedPw = await hashPassword(data.password);
        await env.DB.prepare('INSERT INTO users (id, password, name, phone, company, position, isApproved, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').bind(
            data.id, hashedPw, data.name || data.id, data.phone || '', data.company || '', data.position || '', 'user', Date.now()
        ).run();
        return Response.json({ success: true, message: 'Signup success, waiting approval' }, { headers: corsHeaders });
      }

      if (path === '/users/login' && request.method === 'POST') {
        const data = await request.json();
        // Master Admin Hardcoding Backup
        if (data.id === 'admin' && data.password === '1234') {
            const token = await signToken({ id: 'admin', role: 'admin' });
            return Response.json({ success: true, token, user: { id: 'admin', name: 'Master Admin', isApproved: 1, role: 'admin' } }, { headers: corsHeaders });
        }
        
        const hashedPw = await hashPassword(data.password);
        let user = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND password = ?').bind(data.id, hashedPw).first();
        
        // 점진적 해시 마이그레이션: 해시 매칭 실패 시 기존 평문 비밀번호로 재검증
        if (!user) {
            const legacyUser = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND password = ?').bind(data.id, data.password).first();
            if (legacyUser) {
                // 레거시 계정 발견 → 비밀번호를 해시로 자동 업그레이드
                await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashedPw, legacyUser.id).run();
                user = legacyUser;
            }
        }
        
        if (!user) return Response.json({ success: false, error: 'Invalid ID or Password' }, { status: 401, headers: corsHeaders });
        if (!user.isApproved) return Response.json({ success: false, error: 'Not Approved' }, { status: 403, headers: corsHeaders });
        
        const token = await signToken({ id: user.id, role: user.role });
        return Response.json({ success: true, token, user: { id: user.id, name: user.name, isApproved: user.isApproved, role: user.role } }, { headers: corsHeaders });
      }

      if (path === '/users' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, name, phone, company, position, isApproved, role, createdAt FROM users ORDER BY createdAt DESC').all();
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
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, password TEXT, name TEXT, phone TEXT, company TEXT, position TEXT, isApproved INTEGER, role TEXT, createdAt INTEGER)").run();
          
          // 기존 테이블 호환성을 위한 ALTER (실패 시 무시)
          try { await env.DB.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run(); } catch(e) {}
          try { await env.DB.prepare("ALTER TABLE users ADD COLUMN company TEXT").run(); } catch(e) {}
          try { await env.DB.prepare("ALTER TABLE users ADD COLUMN position TEXT").run(); } catch(e) {}
          
          await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('mainTitle', 'ANDREW YOUTH'), ('subTitle', '믿음으로 기대하다')").run();

          return Response.json({ success: true, message: 'All tables initialized' }, { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
  },
};
