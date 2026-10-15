import { registerDecorator, ValidationOptions } from 'class-validator';

// Compara por día (no por hora): una fecha de vencimiento con la fecha de hoy
// todavía cuenta como vigente. Trabaja sobre el string ISO directo — no
// convertimos la propiedad a Date con class-transformer para no romper el tipo
// `string` que espera el resto del DTO/servicio.
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return false;

          // Un string tipo "2027-01-01" (sin hora) lo parsea como medianoche
          // UTC — comparamos contra la medianoche UTC de hoy, no la local, para
          // no depender de en qué timezone corre el proceso (el server del VPS
          // puede no estar en UTC-3).
          const now = new Date();
          const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

          return date.getTime() >= todayUtcMidnight;
        },
        defaultMessage(): string {
          return 'La fecha no puede ser una fecha pasada — el documento tiene que estar vigente';
        },
      },
    });
  };
}
