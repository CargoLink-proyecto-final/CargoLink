-- Reset de datos operativos en dev y prod.
-- Las dos bases arrastran datos de pruebas manuales (usuarios de prueba, cargas
-- inventadas, viajes a medio camino, chats sueltos) que ya no representan nada.
-- Se vacían de una sola vez para dejar ambos entornos con exactamente lo que
-- crea el seed: cuentas demo + la carga de ejemplo.
--
-- Corre sola al arrancar el contenedor (`prisma migrate deploy` en
-- docker-entrypoint.sh) y el seed la sigue inmediatamente después, así que el
-- server nunca queda sirviendo una base vacía.
--
-- NO toca "provinces" ni "cities": es el padrón oficial de referencia, no son
-- datos de usuario, y re-sembrarlo cuesta varios miles de INSERTs en cada boot.
--
-- Migración de un solo uso: en una base nueva encuentra las tablas ya vacías y
-- no hace nada.
TRUNCATE TABLE
  "messages",
  "ratings",
  "trips",
  "postulations",
  "loads",
  "company_join_requests",
  "role_change_logs",
  "companies",
  "users"
CASCADE;
