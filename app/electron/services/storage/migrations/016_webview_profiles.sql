-- Perfis do navegador interno (blocos Página Web). Cada perfil tem a própria
-- partição do Electron (`persist:felixo-webview-<id>`), então logins de dois
-- perfis não se misturam. O perfil "Padrão" NÃO mora aqui: ele é a partição
-- que já existia (`persist:felixo-webview`), virtual no código, para ninguém
-- ser deslogado na atualização.

CREATE TABLE webview_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
