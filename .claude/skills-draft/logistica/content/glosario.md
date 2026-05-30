# Glosario de logística (CargoLink)

Términos de dominio que aparecen en el producto, el código y la conversación con Claude. Cada entrada es corta. Se incluye el término en español y su equivalente en inglés (que suele ser como aparece en el código).

---

### Dador de carga / shipper (`CARGO_GENERATOR`)

Usuario que publica cargas para que sean transportadas. En el código, el rol es `CARGO_GENERATOR` y la relación es `Load.shipper`.

### Transportista / carrier (`TRANSPORTER`)

Usuario que transporta la carga. En el código, rol `TRANSPORTER`; en un viaje es `Trip.carrier`.

### Carga / load (`Load`)

Lo que se transporta: origen, destino, tipo (`cargoType`), peso (kg), volumen (m³), fechas y precio. Entidad central del producto. Su estado es `LoadStatus`.

### Postulación / postulation (`Postulation`)

Oferta de un transportista para llevar una carga. Puede incluir un precio propuesto y entrar en negociación. Estado: `PostulationStatus`. Un transportista no puede postularse dos veces a la misma carga (unique `loadId + transporterId`).

### Contraoferta / counter-offer

Propuesta de precio que una parte hace en respuesta a la otra durante la negociación. Campo `counterOfferPrice`; `lastOfferBy` indica quién hizo la última.

### Viaje / trip (`Trip`)

Ejecución del transporte de una carga asignada. Uno por carga (`loadId` unique). Estado: `TripStatus`. Lleva la posición GPS (`currentLat`/`currentLng`).

### Tracking

Seguimiento en tiempo real de la posición del transportista durante el viaje. El mobile reporta GPS con `PATCH /trips/:id/location`; la web lo muestra en un mapa Leaflet.

### Calificación / rating (`Rating`)

Puntaje (1–5) + comentario que un participante deja al otro al terminar un viaje (`COMPLETED`). Una por persona por viaje.

### Asignación / assignment

Momento en que una postulación se acepta: se crea el `Trip` y la `Load` pasa a `ASSIGNED`. También puede hacerla un admin manualmente (override).

### Origen / destino (origin / destination)

Punto de recogida y de entrega de la carga, cada uno con dirección y coordenadas (`originLat/Lng`, `destLat/Lng`) para el mapa.

### Carga cerrada / registro (register)

Cargas en estado terminal (`DELIVERED` o `CANCELLED`). Accesibles en `GET /api/loads/register` y exportables a ZIP (CSV de loads + messages).

### <<COMPLETAR: agregar términos del rubro que falten>>

<<COMPLETAR: definición>>

---

## Cómo agregar un término

Copiar la estructura `### Término` + línea en blanco + definición corta (1–3 líneas). Si el término tiene un nombre distinto en el código, mencionalo entre paréntesis.
