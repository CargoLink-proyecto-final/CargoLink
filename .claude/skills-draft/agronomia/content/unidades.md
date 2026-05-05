# Unidades en Rinde

Este archivo define las unidades estándar que usa Rinde para expresar cada tipo de dato. La convención importa: los endpoints, dashboards y reportes asumen estas unidades. Si cambian, el cambio impacta código.

## Tabla de unidades estándar

| Magnitud | Unidad estándar en Rinde | Notas |
|---|---|---|
| Rinde | **qq/ha** (quintales por hectárea) | <<COMPLETAR: confirmar si qq/ha es universal o si algún reporte usa kg/ha o tn/ha>> |
| Superficie | **ha** (hectáreas) | — |
| Precipitación | **mm** | Acumulado en el período considerado. |
| Temperatura | **°C** | — |
| Evapotranspiración | **mm** | ETo o ETc según contexto. |
| Radiación | <<COMPLETAR: unidad — ej. MJ/m²/día o W/m²>> | — |
| Cobertura de nubes | **%** | 0 a 100. |
| Humedad de suelo | <<COMPLETAR: unidad — % volumétrico, % disponible, mm equivalente>> | — |
| Densidad de siembra | <<COMPLETAR: semillas/ha o pl/ha>> | — |
| Dosis de fertilizante | **kg/ha** del nutriente (N, P₂O₅, K₂O) | — |

## Conversiones útiles

- 1 tn/ha = 10 qq/ha
- 1 qq/ha = 100 kg/ha
- 1 ha = 10.000 m² = 2.47 acres

## Cuándo usar cada unidad

<<COMPLETAR: reglas de contexto — ej. "en reportes públicos usamos qq/ha, en exports a CSV usamos kg/ha para precisión", "la UI muestra mm en lluvias acumuladas por campaña", etc.>>

## Histórico

Si cambia una unidad estándar, anotar acá la fecha y el motivo. Esto ayuda a interpretar reportes viejos.

- <<COMPLETAR cuando aplique>>
