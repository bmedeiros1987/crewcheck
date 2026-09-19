-- Isolated pilot namespace. Apply explicitly; never run automatically on boot.
CREATE TABLE IF NOT EXISTS crewcheck_tv_registry (
  id TINYINT PRIMARY KEY,
  payload JSON NOT NULL
);
INSERT IGNORE INTO crewcheck_tv_registry (id,payload)
VALUES (1, JSON_OBJECT('pairings',JSON_OBJECT(),'devices',JSON_OBJECT(),'limits',JSON_OBJECT()));
