-- Decisões de permissão dos sites abertos nos blocos Página Web: uma por perfil
-- do navegador, origem (esquema + host + porta) e permissão. Sem linha, o site
-- pergunta; "denied" também é lembrado, até a pessoa revogar.
CREATE TABLE webview_site_permissions (
  profile_id TEXT NOT NULL CHECK (length(profile_id) BETWEEN 1 AND 40),
  origin TEXT NOT NULL CHECK (length(origin) BETWEEN 1 AND 300),
  permission TEXT NOT NULL CHECK (length(permission) BETWEEN 1 AND 60),
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'denied')),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, origin, permission)
);
