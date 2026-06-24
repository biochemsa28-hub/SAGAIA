export const metadata = { title: "Términos y Condiciones · VYNAVO" };

const EFFECTIVE = "12 de junio de 2026";
const COMPANY = "VYNAVO";
const EMAIL = "legal@vynavo.com";
const URL = "https://vynavo.com";

export default function TermsPage() {
  return (
    <article className="prose prose-invert prose-zinc max-w-none">
      <h1 className="text-3xl font-bold text-white mb-2">Términos y Condiciones</h1>
      <p className="text-zinc-500 text-sm mb-10">Vigentes desde el {EFFECTIVE}</p>

      <Section title="1. Aceptación de los términos">
        <p>Al acceder o utilizar la plataforma <strong>{COMPANY}</strong> (en adelante "el Servicio"), disponible en <strong>{URL}</strong>, aceptas quedar vinculado por estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no podrás acceder al Servicio.</p>
        <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente tras su publicación. El uso continuado del Servicio constituye aceptación de los nuevos términos.</p>
      </Section>

      <Section title="2. Descripción del Servicio">
        <p>{COMPANY} es una plataforma de generación de contenido audiovisual mediante inteligencia artificial que permite a los usuarios:</p>
        <ul>
          <li>Generar guiones de microseries virales mediante IA (OpenAI GPT-4)</li>
          <li>Producir narración de voz en off mediante síntesis de voz (ElevenLabs)</li>
          <li>Generar imágenes para cada escena mediante IA generativa (Flux)</li>
          <li>Animar escenas en clips de video (Kling AI)</li>
          <li>Ensamblar el video final con subtítulos (Shotstack)</li>
        </ul>
        <p>El Servicio opera bajo un sistema de créditos. Cada proyecto consume créditos según el plan contratado.</p>
      </Section>

      <Section title="3. Registro y cuentas de usuario">
        <p>Para acceder al Servicio debes crear una cuenta con información veraz y completa. Eres responsable de:</p>
        <ul>
          <li>Mantener la confidencialidad de tu contraseña</li>
          <li>Todas las actividades que ocurran bajo tu cuenta</li>
          <li>Notificarnos inmediatamente ante cualquier uso no autorizado</li>
        </ul>
        <p>Nos reservamos el derecho de suspender o eliminar cuentas que violen estos términos, proporcionen información falsa, o realicen actividades fraudulentas.</p>
      </Section>

      <Section title="4. Créditos y pagos">
        <p><strong>4.1 Sistema de créditos.</strong> El Servicio opera mediante créditos prepagados. Cada generación de proyecto consume créditos según se indica en la plataforma en el momento de la transacción.</p>
        <p><strong>4.2 Precios.</strong> Los precios están expresados en dólares estadounidenses (USD) e incluyen los impuestos aplicables salvo indicación contraria. Nos reservamos el derecho de modificar los precios con 30 días de preaviso.</p>
        <p><strong>4.3 Procesamiento de pagos.</strong> Los pagos son procesados de forma segura por Stripe. No almacenamos datos de tarjetas de crédito en nuestros servidores.</p>
        <p><strong>4.4 Política de reembolsos.</strong> Los créditos comprados son no reembolsables salvo en los siguientes casos: (a) error técnico comprobable de nuestra parte que impidió el uso del servicio, o (b) cargo no autorizado documentado. Las solicitudes de reembolso deben enviarse a <strong>{EMAIL}</strong> dentro de los 7 días siguientes a la transacción.</p>
        <p><strong>4.5 Vencimiento de créditos.</strong> Los créditos no tienen fecha de vencimiento mientras la cuenta permanezca activa. En caso de inactividad superior a 24 meses, nos reservamos el derecho de cancelar los créditos sin uso previo aviso de 30 días.</p>
      </Section>

      <Section title="5. Uso aceptable">
        <p>Al usar el Servicio, aceptas <strong>no</strong> utilizar el contenido generado para:</p>
        <ul>
          <li>Crear contenido difamatorio, fraudulento, engañoso o que incite al odio</li>
          <li>Generar desinformación, noticias falsas o propaganda política</li>
          <li>Producir contenido que infrinja derechos de autor, marcas o cualquier propiedad intelectual de terceros</li>
          <li>Crear material sexualmente explícito o que involucre menores</li>
          <li>Acosar, amenazar o intimidar a personas reales identificables</li>
          <li>Cualquier actividad ilegal bajo las leyes aplicables en tu jurisdicción</li>
          <li>Intentar vulnerar los sistemas de seguridad de la plataforma</li>
          <li>Revender o redistribuir el acceso al Servicio sin autorización expresa</li>
        </ul>
      </Section>

      <Section title="6. Propiedad intelectual del contenido generado">
        <p><strong>6.1 Contenido del usuario.</strong> Eres el propietario de las premisas, ideas y prompts que introduces en el Servicio.</p>
        <p><strong>6.2 Contenido generado por IA.</strong> El contenido generado por las IAs integradas (guiones, imágenes, audio, video) se te cede bajo licencia no exclusiva para uso comercial y personal, sujeta a los términos de los proveedores de IA subyacentes (OpenAI, ElevenLabs, Flux, Kling, Shotstack). Te recomendamos revisar sus políticas de uso.</p>
        <p><strong>6.3 Marca y plataforma.</strong> El nombre, logo, interfaz y código fuente de {COMPANY} son propiedad exclusiva nuestra y están protegidos por las leyes de propiedad intelectual aplicables.</p>
        <p><strong>6.4 Datos de entrenamiento.</strong> No utilizamos el contenido que generas para entrenar nuestros modelos de IA. El contenido generado es procesado únicamente para entregarte el resultado solicitado.</p>
      </Section>

      <Section title="7. Limitación de responsabilidad">
        <p>El Servicio se proporciona "tal cual" y "según disponibilidad". En la máxima medida permitida por la ley aplicable:</p>
        <ul>
          <li>No garantizamos que el Servicio sea ininterrumpido, seguro o libre de errores</li>
          <li>No somos responsables por la idoneidad del contenido generado para monetización en plataformas de terceros (TikTok, Instagram, YouTube, etc.) ya que sus políticas pueden cambiar</li>
          <li>Nuestra responsabilidad máxima ante cualquier reclamación no superará el importe pagado por el usuario en los 3 meses previos al evento que originó la reclamación</li>
          <li>No somos responsables de daños indirectos, consecuentes, pérdida de beneficios o pérdida de datos</li>
        </ul>
      </Section>

      <Section title="8. Disponibilidad del Servicio">
        <p>Nos esforzamos por mantener el Servicio disponible 24/7 pero no garantizamos disponibilidad ininterrumpida. Podemos realizar mantenimientos programados con aviso previo. Nos reservamos el derecho de modificar, suspender o discontinuar el Servicio con 30 días de preaviso, salvo en casos de fuerza mayor o violaciones de seguridad.</p>
      </Section>

      <Section title="9. Cancelación de cuenta">
        <p>Puedes cancelar tu cuenta en cualquier momento desde los ajustes de la plataforma o enviando un correo a <strong>{EMAIL}</strong>. Tras la cancelación, los créditos sin usar no serán reembolsados salvo disposición legal aplicable. Conservamos los datos durante 30 días tras la cancelación para cumplimiento legal, tras lo cual los eliminamos.</p>
      </Section>

      <Section title="10. Ley aplicable y jurisdicción">
        <p>Estos Términos se rigen por las leyes aplicables en el lugar de constitución de la empresa. Cualquier disputa se resolverá preferentemente mediante negociación amistosa. Si no fuera posible, las partes se someten a la jurisdicción de los tribunales competentes.</p>
      </Section>

      <Section title="11. Contacto">
        <p>Para cualquier consulta sobre estos Términos, contacta con nosotros en:</p>
        <p><strong>Email:</strong> {EMAIL}<br /><strong>Plataforma:</strong> {URL}</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3 mt-8 pb-2 border-b border-zinc-800">{title}</h2>
      <div className="text-zinc-300 space-y-3 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-zinc-100">
        {children}
      </div>
    </section>
  );
}
