import type { Metadata } from 'next';
import Link from 'next/link';
import { Truck } from 'lucide-react';

/**
 * Política de privacidad pública.
 *
 * Es un requisito duro de la App Store: App Store Connect pide una URL de
 * política de privacidad accesible sin credenciales para publicar la app, y la
 * revisión la abre. Por eso vive fuera de `/dashboard` y no usa el layout
 * autenticado ni ningún hook — Server Component puro.
 */
export const metadata: Metadata = {
  title: 'Política de privacidad · CargoLink',
  description:
    'Qué datos recopila CargoLink, para qué los usa, con quién los comparte y cómo eliminarlos.',
};

const LAST_UPDATED = '11 de octubre de 2026';
const CONTACT_EMAIL = 'soportecargolink@gmail.com';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
          <Link href="/" className="inline-flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary-600" aria-hidden />
            <span className="font-semibold tracking-tight text-ink-900">CargoLink</span>
          </Link>
          <span className="text-xs text-ink-400">Actualizada el {LAST_UPDATED}</span>
        </div>
      </header>

      {/* Ancho de lectura: ~65 caracteres por línea, que es donde el texto largo
          deja de cansar. Por eso max-w-2xl y no el ancho del dashboard. */}
      <main className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Política de privacidad
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
          CargoLink es una plataforma que conecta a quienes necesitan transportar carga con
          transportistas. Para que eso funcione necesitamos algunos de tus datos. Acá está, sin
          vueltas, qué guardamos, para qué, con quién lo compartimos y cómo pedir que lo borremos.
        </p>

        <Section title="Qué datos recopilamos">
          <p>
            <strong className="font-medium text-ink-800">De tu cuenta:</strong> nombre y apellido,
            correo electrónico, contraseña (guardada siempre como hash, nunca en texto claro),
            teléfono, rol, y si sos publicador de carga, el nombre y el rubro de tu empresa.
          </p>
          <p>
            <strong className="font-medium text-ink-800">Si sos transportista, para validar tu
            perfil:</strong> tu CUIT, la categoría y el vencimiento de tu licencia, los datos de tu
            vehículo (patente, marca, modelo, capacidad y vencimientos del seguro y la VTV) y las
            fotos o PDF de tu DNI, tu licencia, tu constancia de AFIP, la cédula del vehículo, el
            seguro y la VTV. Esos archivos sólo los ven vos y un administrador de CargoLink que los
            revisa; nunca se publican ni se comparten con quien publica cargas.
          </p>
          <p>
            <strong className="font-medium text-ink-800">De tu actividad:</strong> las cargas que
            publicás, las postulaciones y contraofertas, los viajes, los mensajes del chat y las
            calificaciones que das y recibís.
          </p>
          <p>
            <strong className="font-medium text-ink-800">Ubicación:</strong> si sos transportista,
            durante un viaje en curso la app reporta tu posición para que quien publicó la carga
            pueda seguirlo. Fuera de un viaje, sólo leemos tu ubicación si vos tocás{' '}
            <em>usar mi ubicación actual</em> para fijar el centro de tu zona de trabajo habitual —
            esas coordenadas también las podés escribir a mano. Podés revocar el permiso desde los
            ajustes del teléfono en cualquier momento; el viaje sigue existiendo, pero deja de
            actualizar la posición.
          </p>
          <p>
            <strong className="font-medium text-ink-800">Del dispositivo:</strong> si activás las
            notificaciones, guardamos el identificador que emite tu teléfono para poder enviarlas.
            No es tu número ni nada que te identifique fuera de la app.
          </p>
        </Section>

        <Section title="Para qué los usamos">
          <p>
            Para operar el servicio: crear tu cuenta y validarla, mostrar las cargas a los
            transportistas y las postulaciones a los publicadores, permitir la negociación del
            precio, abrir el viaje y hacer su seguimiento, sostener el chat entre las partes, y
            calcular las calificaciones.
          </p>
          <p>
            También usamos tu correo para cosas imprescindibles de la cuenta: verificar la
            dirección, recuperar la contraseña y avisarte de mensajes o novedades de tus viajes.{' '}
            <strong className="font-medium text-ink-800">No vendemos tus datos</strong> ni los
            usamos para publicidad de terceros.
          </p>
        </Section>

        <Section title="Con quién se comparten">
          <p>
            <strong className="font-medium text-ink-800">Con la otra parte de la operación.</strong>{' '}
            Es el punto del servicio: cuando te postulás a una carga, quien la publicó ve tu nombre,
            tu empresa si la declaraste y tus calificaciones; cuando se abre el viaje, ve también la
            ubicación que reporta la app durante el trayecto.
          </p>
          <p>
            <strong className="font-medium text-ink-800">Con proveedores</strong>, sólo lo mínimo
            que cada uno necesita: el servicio de notificaciones de Expo (para entregar los avisos
            al teléfono) y un servidor de correo (para los emails de la cuenta).
          </p>
          <p>
            <strong className="font-medium text-ink-800">Con OpenStreetMap.</strong> Cuando escribís
            una dirección de origen o destino, ese texto se manda al geocodificador de
            OpenStreetMap para convertirlo en coordenadas, y el cálculo de la ruta se hace contra un
            servidor de OSRM. Los mapas también se dibujan con imágenes que tu navegador o tu
            teléfono piden directamente a esos servidores, así que ellos ven tu dirección IP. No
            reciben tu nombre, tu correo ni ningún dato de tu cuenta.
          </p>
          <p>
            Y ante un requerimiento legal de una autoridad competente, cuando corresponda.
          </p>
        </Section>

        <Section title="Cuánto tiempo los guardamos">
          <p>
            Mientras tengas la cuenta abierta. Cuando la eliminás, borramos tus datos personales en
            el momento; lo que sobrevive es el registro de las operaciones que hiciste con otras
            personas, ya sin tu nombre.
          </p>
        </Section>

        <Section title="Cómo eliminar tu cuenta">
          <p>
            Desde la app, en <strong className="font-medium text-ink-800">Perfil → Eliminar mi
            cuenta</strong>. No hace falta escribirnos ni pedir autorización. La única condición es
            que no tengas cargas o viajes en curso: primero hay que cerrarlos, porque del otro lado
            hay alguien esperando esa operación.
          </p>
          <p>
            Al eliminarla borramos tu nombre, tu correo, tu teléfono, el nombre y el rubro que
            declaraste, tu zona de trabajo y el identificador de notificaciones, y tu contraseña
            queda inservible. Si sos transportista, también borramos tu CUIT, los datos de tu
            licencia y de tu vehículo, y los documentos que subiste. Tus postulaciones abiertas se retiran. Si administrabas una empresa en
            la plataforma, también se borra su nombre y sus integrantes quedan desvinculados. La
            cuenta no se puede recuperar —ni vos ni un administrador— y tu correo vuelve a quedar
            libre para registrarte de nuevo si algún día querés volver.
          </p>
          <p>
            Lo que <strong className="font-medium text-ink-800">no</strong> borramos son los viajes,
            las cargas, los mensajes y las calificaciones de esas operaciones, porque también
            pertenecen a la otra parte: un transportista perdería su historial y su reputación si
            desaparecieran las operaciones de quienes se dieron de baja. Esos registros quedan
            atribuidos a un &ldquo;Usuario eliminado&rdquo;, sin ningún dato que te identifique.
          </p>
        </Section>

        <Section title="Tus derechos">
          <p>
            Podés acceder a tus datos, corregirlos y pedir que se eliminen. Buena parte lo hacés
            solo: el perfil se edita desde la app y la cuenta se elimina desde ahí mismo. Para
            cualquier otro pedido, escribinos a{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-primary-700 underline decoration-primary-200 underline-offset-2 hover:text-primary-800"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            En Argentina, la Ley 25.326 de Protección de Datos Personales te da el derecho de
            acceder gratuitamente a tus datos en intervalos no menores a seis meses, y la Agencia de
            Acceso a la Información Pública es el organismo que atiende los reclamos ante
            incumplimientos.
          </p>
        </Section>

        <Section title="Seguridad">
          <p>
            El tráfico viaja cifrado por HTTPS, las contraseñas se guardan hasheadas con bcrypt y el
            acceso a la base de datos está restringido. Ningún sistema es infalible: si detectamos un
            incidente que afecte tus datos, te vamos a avisar.
          </p>
        </Section>

        <Section title="Menores de edad">
          <p>
            CargoLink es una herramienta de trabajo y no está dirigida a menores de 18 años. No
            recopilamos datos de menores a sabiendas.
          </p>
        </Section>

        <Section title="Cambios en esta política">
          <p>
            Si la actualizamos, cambiamos la fecha del encabezado. Cuando el cambio sea
            significativo, te avisamos por correo o dentro de la aplicación antes de que entre en
            vigencia.
          </p>
        </Section>

        <Section title="Contacto">
          <p>
            Por cualquier duda sobre esta política o sobre tus datos:{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-primary-700 underline decoration-primary-200 underline-offset-2 hover:text-primary-800"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="border-t border-ink-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6 text-xs text-ink-400">
          <span>CargoLink</span>
          <Link href="/auth/login" className="hover:text-ink-600">
            Iniciar sesión
          </Link>
        </div>
      </footer>
    </div>
  );
}
