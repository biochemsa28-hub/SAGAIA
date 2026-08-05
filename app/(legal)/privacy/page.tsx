export const metadata = { title: "Política de Privacidad · VYNAVO" };

const EFFECTIVE = "12 de junio de 2026";
const EMAIL = "privacidad@vynavo.com";
const URL = "https://vynavo.com";

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-white mb-2">Política de Privacidad</h1>
      <p className="text-zinc-500 text-sm mb-10">Vigente desde el {EFFECTIVE}</p>

      <Section title="1. Responsable del tratamiento">
        <p>VYNAVO (en adelante "nosotros") es el responsable del tratamiento de los datos personales recogidos a través de la plataforma disponible en <strong>{URL}</strong>. Para cualquier consulta relacionada con privacidad, contáctanos en <strong>{EMAIL}</strong>.</p>
      </Section>

      <Section title="2. Datos que recopilamos">
        <p><strong>2.1 Datos que nos proporcionas directamente:</strong></p>
        <ul>
          <li><strong>Registro:</strong> nombre, dirección de correo electrónico y contraseña (almacenada con hash bcrypt, nunca en texto plano)</li>
          <li><strong>Pagos:</strong> procesados íntegramente por Stripe. No almacenamos números de tarjeta, CVV ni datos bancarios en nuestros servidores</li>
          <li><strong>Contenido creado:</strong> los temas, premisas e instrucciones que introduces para generar tus proyectos</li>
        </ul>
        <p><strong>2.2 Datos que recopilamos automáticamente:</strong></p>
        <ul>
          <li><strong>Datos de uso:</strong> páginas visitadas, funciones utilizadas, tiempo en la plataforma (mediante PostHog, configurado sin cookies de terceros)</li>
          <li><strong>Datos técnicos:</strong> dirección IP, tipo de navegador, sistema operativo y dispositivo (para seguridad y diagnóstico)</li>
          <li><strong>Logs de API:</strong> registros de llamadas a los servicios de IA para depuración y facturación (proveedor, tokens usados, duración)</li>
        </ul>
        <p><strong>2.3 Lo que NO recopilamos:</strong></p>
        <ul>
          <li>No accedemos al micrófono, cámara ni contactos de tu dispositivo</li>
          <li>No compramos ni cruzamos datos con corredores de datos de terceros</li>
          <li>No rastreamos tu actividad fuera de nuestra plataforma</li>
        </ul>
      </Section>

      <Section title="3. Cómo usamos tus datos">
        <p>Usamos tus datos exclusivamente para:</p>
        <ul>
          <li><strong>Prestación del servicio:</strong> procesar tus proyectos, gestionar tu cuenta y créditos</li>
          <li><strong>Comunicaciones del servicio:</strong> notificaciones transaccionales (video listo, confirmación de pago, alertas de seguridad)</li>
          <li><strong>Mejora del producto:</strong> análisis agregados y anónimos de uso para mejorar la plataforma</li>
          <li><strong>Seguridad:</strong> detección de fraude, accesos no autorizados y abusos del servicio</li>
          <li><strong>Cumplimiento legal:</strong> cuando la ley nos obligue a conservar o revelar información</li>
        </ul>
        <p>No usamos tus datos para publicidad de terceros ni los vendemos bajo ninguna circunstancia.</p>
      </Section>

      <Section title="4. Base legal del tratamiento">
        <ul>
          <li><strong>Ejecución del contrato:</strong> necesitamos procesar tus datos para prestarte el servicio que has contratado</li>
          <li><strong>Interés legítimo:</strong> para la seguridad de la plataforma y la prevención del fraude</li>
          <li><strong>Consentimiento:</strong> para comunicaciones de marketing, cuando las activemos (con opción de baja en cada mensaje)</li>
          <li><strong>Obligación legal:</strong> conservación de registros de facturación según normativa aplicable</li>
        </ul>
      </Section>

      <Section title="5. Proveedores de servicios (subencargados)">
        <p>Para prestarte el servicio trabajamos con los siguientes proveedores, cada uno con sus propias políticas de privacidad:</p>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Función</th>
              <th>Datos transferidos</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Anthropic (Claude)</td><td>Generación de guiones y elenco</td><td>Premisa e instrucciones del proyecto</td></tr>
            <tr><td>OpenAI</td><td>Generación de guiones (alternativa)</td><td>Premisa e instrucciones del proyecto</td></tr>
            <tr><td>ElevenLabs</td><td>Síntesis de voz, música y efectos</td><td>Texto de narración de cada escena</td></tr>
            <tr><td>Fal.ai</td><td>Generación y edición de imágenes</td><td>Prompts de imagen y retratos de referencia</td></tr>
            <tr><td>ByteDance (Seedance, vía Fal.ai)</td><td>Animación de clips</td><td>Prompts de animación e imágenes de escena</td></tr>
            <tr><td>Cloudflare R2</td><td>Almacenamiento de archivos generados</td><td>Imágenes, audio y videos del proyecto</td></tr>
            <tr><td>Shotstack</td><td>Ensamblaje de video (opcional)</td><td>URLs de clips y audio</td></tr>
            <tr><td>Stripe</td><td>Procesamiento de pagos</td><td>Datos de facturación</td></tr>
            <tr><td>Turso (libSQL)</td><td>Base de datos</td><td>Todos los datos de cuenta</td></tr>
            <tr><td>Vercel</td><td>Hosting</td><td>Logs del servidor, IP</td></tr>
            <tr><td>PostHog</td><td>Analítica de producto</td><td>Eventos de uso (sin datos personales sensibles)</td></tr>
            <tr><td>Resend</td><td>Envío de emails</td><td>Nombre y correo para notificaciones</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="6. Retención de datos">
        <ul>
          <li><strong>Datos de cuenta:</strong> mientras la cuenta esté activa y 30 días adicionales tras la cancelación</li>
          <li><strong>Proyectos y contenido:</strong> durante la vigencia de la cuenta; puedes eliminar proyectos individuales en cualquier momento</li>
          <li><strong>Registros de facturación:</strong> 5 años según obligaciones fiscales aplicables</li>
          <li><strong>Logs de seguridad:</strong> 90 días</li>
          <li><strong>Datos de analítica:</strong> 24 meses en forma agregada</li>
        </ul>
      </Section>

      <Section title="7. Tus derechos">
        <p>Según la normativa de protección de datos aplicable, tienes derecho a:</p>
        <ul>
          <li><strong>Acceso:</strong> solicitar una copia de tus datos personales que tenemos</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos</li>
          <li><strong>Supresión ("derecho al olvido"):</strong> solicitar la eliminación de tus datos</li>
          <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado y legible por máquina</li>
          <li><strong>Oposición:</strong> oponerte al tratamiento basado en interés legítimo</li>
          <li><strong>Limitación:</strong> solicitar que restrinjamos el tratamiento de tus datos</li>
        </ul>
        <p>Para ejercer cualquiera de estos derechos, escríbenos a <strong>{EMAIL}</strong> indicando tu nombre, email de cuenta y la solicitud específica. Responderemos en un plazo máximo de 30 días.</p>
      </Section>

      <Section title="8. Cookies y tecnologías similares">
        <p>Utilizamos las siguientes cookies esenciales para el funcionamiento del Servicio:</p>
        <ul>
          <li><strong>next-auth.session-token:</strong> cookie de sesión autenticada (HttpOnly, Secure, SameSite=Lax)</li>
          <li><strong>next-auth.csrf-token:</strong> protección CSRF</li>
          <li><strong>ph_posthog:</strong> identificador de sesión anónima para analítica (localStorage, no cookie)</li>
        </ul>
        <p>No utilizamos cookies de publicidad ni de seguimiento de terceros.</p>
      </Section>

      <Section title="9. Seguridad de los datos">
        <p>Aplicamos las siguientes medidas técnicas y organizativas para proteger tus datos:</p>
        <ul>
          <li>Cifrado en tránsito mediante TLS 1.2+ en todas las comunicaciones</li>
          <li>Contraseñas almacenadas con hash bcrypt (coste 12)</li>
          <li>Tokens de sesión con rotación automática y expiración</li>
          <li>Cabeceras de seguridad HTTP (HSTS, CSP, X-Frame-Options, etc.)</li>
          <li>Rate limiting en endpoints de autenticación para prevenir ataques de fuerza bruta</li>
          <li>Acceso a producción restringido con principio de mínimo privilegio</li>
          <li>Auditoría de dependencias con npm audit de forma periódica</li>
        </ul>
        <p>En caso de brecha de seguridad que afecte a tus datos, te notificaremos en un plazo máximo de 72 horas tras su detección.</p>
      </Section>

      <Section title="10. Transferencias internacionales">
        <p>Algunos de nuestros proveedores (OpenAI, ElevenLabs, Stripe, Vercel, PostHog) están ubicados en Estados Unidos. Estas transferencias se realizan bajo las garantías adecuadas (Cláusulas Contractuales Tipo o certificación EU-US Data Privacy Framework según corresponda).</p>
      </Section>

      <Section title="11. Menores de edad">
        <p>El Servicio está dirigido exclusivamente a mayores de 18 años. No recopilamos conscientemente datos de menores. Si detectamos que un usuario menor ha creado una cuenta, la eliminaremos inmediatamente junto con todos sus datos.</p>
      </Section>

      <Section title="12. Cambios en esta Política">
        <p>Podemos actualizar esta Política periódicamente. Los cambios significativos te serán notificados por email o mediante aviso destacado en la plataforma con al menos 15 días de antelación. La fecha de última actualización siempre aparecerá al inicio del documento.</p>
      </Section>

      <Section title="13. Contacto">
        <p>Para cualquier consulta, ejercicio de derechos o reclamación relacionada con privacidad:</p>
        <p><strong>Email de privacidad:</strong> {EMAIL}<br />
        <strong>Plataforma:</strong> {URL}</p>
        <p>Si consideras que el tratamiento de tus datos no se ajusta a la normativa, tienes derecho a presentar una reclamación ante la autoridad de protección de datos competente en tu país.</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3 mt-8 pb-2 border-b border-zinc-800">{title}</h2>
      <div className="text-zinc-300 space-y-3 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-zinc-100 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:text-zinc-400 [&_th]:pb-2 [&_th]:font-semibold [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top [&_tr]:border-b [&_tr]:border-zinc-800/60">
        {children}
      </div>
    </section>
  );
}
