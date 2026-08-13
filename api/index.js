const SUPABASE_URL = 'https://wumbambjscjrwryapmuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1bWJhbWJqc2NqcndyeWFwbXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1Nzg3MTgsImV4cCI6MjEwMjE1NDcxOH0.W1kPSYJ7O85bKPRK7Tz1VXO-I-mMi49kgUpq5yHYD5Q';

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function setSession(res, token) {
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error((data && data.message) || text || 'Request failed');
    err.status = response.status;
    throw err;
  }
  return data;
}

const sessionArgs = req => ({ p_secret: '', p_token: getCookie(req, 'session') });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};

  try {
    switch (body.action) {
      case 'login': {
        const data = await rpc('login_user', {
          p_secret: '',
          p_username: String(body.staffNo || ''),
          p_password: String(body.password || '')
        });
        const user = Array.isArray(data) ? data[0] : data;
        if (!user || !user.token) throw new Error('login_failed');
        setSession(res, user.token);
        delete user.token;
        return res.json({ ok: true, user });
      }
      case 'logout': {
        const token = getCookie(req, 'session');
        if (token) await rpc('logout_user', { p_secret: '', p_token: token });
        clearSession(res);
        return res.json({ ok: true });
      }
      case 'me': {
        const data = await rpc('session_user', sessionArgs(req));
        const user = Array.isArray(data) ? data[0] : data;
        if (!user) return res.status(401).json({ error: 'Sesi telah tamat.' });
        return res.json({ user });
      }
      case 'gallery':
        return res.json({ photos: (await rpc('gallery_data', sessionArgs(req))) || [] });
      case 'like':
        return res.json({ ok: true, liked: await rpc('toggle_like', { ...sessionArgs(req), p_photo: body.photoId }) });
      case 'upload': {
        const image = String(body.image || '');
        if (image.length > 3500000) return res.status(413).json({ error: 'Imej terlalu besar.' });
        const id = await rpc('upload_photo', {
          ...sessionArgs(req),
          p_title: String(body.title || ''),
          p_description: String(body.description || ''),
          p_image: image
        });
        return res.json({ ok: true, id });
      }
      case 'admin':
        return res.json({ dashboard: await rpc('admin_dashboard', sessionArgs(req)) });
      case 'deletePhoto':
        await rpc('delete_photo_admin', { ...sessionArgs(req), p_photo: body.photoId });
        return res.json({ ok: true });
      case 'createMember': {
        const id = await rpc('create_member', {
          ...sessionArgs(req),
          p_username: String(body.staffNo || ''),
          p_password: 'Felcra@2026',
          p_full_name: String(body.fullName || '')
        });
        return res.json({ ok: true, id });
      }
      case 'resetMember':
        await rpc('reset_member_password', { ...sessionArgs(req), p_staff_no: String(body.staffNo || ''), p_new_password: 'Felcra@2026' });
        return res.json({ ok: true });
      case 'resetAll': {
        const count = await rpc('reset_all_member_passwords', { ...sessionArgs(req), p_new_password: 'Felcra@2026' });
        return res.json({ ok: true, count });
      }
      default:
        return res.status(400).json({ error: 'Tindakan tidak sah.' });
    }
  } catch (err) {
    const message = String(err.message || 'Ralat');
    if (message.includes('login_failed')) return res.status(401).json({ error: 'No. Staf atau kata laluan tidak tepat.' });
    if (message.includes('session_invalid')) {
      clearSession(res);
      return res.status(401).json({ error: 'Sesi telah tamat. Sila log masuk semula.' });
    }
    if (message.includes('admin_required')) return res.status(403).json({ error: 'Akses admin diperlukan.' });
    if (message.includes('duplicate key')) return res.status(409).json({ error: 'No. Staf telah wujud.' });
    return res.status(err.status || 500).json({ error: 'Tidak dapat memproses permintaan.' });
  }
}
