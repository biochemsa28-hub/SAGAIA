import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vynavo.com";
const FROM = "VYNAVO <noreply@vynavo.com>";

// Devuelve true si el correo se envió de verdad. Importa: sin RESEND_API_KEY el
// enlace no llega a ninguna parte, y quien llama necesita saberlo para poder
// dejarlo en el log del servidor en vez de perderlo — si no, el usuario queda
// esperando un correo que nunca se mandó y nadie se entera.
export async function sendPasswordResetEmail({
  to,
  userName,
  resetUrl,
}: {
  to: string;
  userName: string | null;
  resetUrl: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const firstName = (userName ?? "").split(" ")[0] || "Hola";

  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Restablecé tu contraseña de VYNAVO",
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#16171f">
        <p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#7c8095;margin:0 0 18px">VYNAVO</p>
        <h1 style="font-size:22px;margin:0 0 12px">${firstName}, restablecé tu contraseña</h1>
        <p style="color:#4a4d5c;line-height:1.6;margin:0 0 24px">
          Pediste volver a entrar a tu cuenta. Este enlace funciona <strong>una sola vez</strong> y vence en una hora.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:#4453c8;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600">
          Crear una contraseña nueva
        </a>
        <p style="color:#7c8095;font-size:13px;line-height:1.6;margin:26px 0 0">
          Si no lo pediste, podés ignorar este correo: tu contraseña actual sigue funcionando y nadie entró a tu cuenta.
        </p>
      </div>`,
  });
  return true;
}

export async function sendVideoReadyEmail({
  to,
  userName,
  projectTitle,
  projectId,
  videoUrl,
}: {
  to: string;
  userName: string;
  projectTitle: string;
  projectId: string;
  videoUrl: string;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const projectUrl = `${APP_URL}/dashboard/projects/${projectId}`;
  const firstName = userName.split(" ")[0] ?? userName;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `🎬 Tu video está listo — ${projectTitle}`,
    html: emailHtml({ firstName, projectTitle, projectUrl, videoUrl }),
  });
}

function emailHtml({
  firstName,
  projectTitle,
  projectUrl,
  videoUrl,
}: {
  firstName: string;
  projectTitle: string;
  projectUrl: string;
  videoUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu video está listo</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">VYNAVO</span>
              <span style="display:inline-block;margin-left:6px;background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;letter-spacing:1px;">IA</span>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e1033 0%,#18181b 100%);border:1px solid #3f3f46;border-radius:20px;padding:40px 32px;text-align:center;">

              <div style="font-size:48px;margin-bottom:16px;">🎬</div>

              <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#fff;line-height:1.3;">
                ¡Tu video está listo!
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Hola ${firstName}, terminamos de producir tu microserie con IA.
              </p>
              <p style="margin:0 0 28px;font-size:13px;color:#7c3aed;font-weight:600;">
                ${projectTitle}
              </p>

              <!-- CTA principal -->
              <a href="${projectUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:14px;margin-bottom:12px;">
                Ver y descargar mi video →
              </a>

              <br />

              <!-- CTA secundario -->
              <a href="${videoUrl}"
                style="display:inline-block;margin-top:8px;color:#7c3aed;font-size:13px;text-decoration:underline;">
                Descargar MP4 directo
              </a>
            </td>
          </tr>

          <!-- Tips rápidos -->
          <tr>
            <td style="padding:24px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Para maximizar tu alcance</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#10b981;font-size:14px;margin-right:8px;">✓</span>
                          <span style="color:#d4d4d8;font-size:13px;">Publica en TikTok, Reels y Shorts el mismo día</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#10b981;font-size:14px;margin-right:8px;">✓</span>
                          <span style="color:#d4d4d8;font-size:13px;">Responde cada comentario en las primeras 2 horas</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#10b981;font-size:14px;margin-right:8px;">✓</span>
                          <span style="color:#d4d4d8;font-size:13px;">Fija el hook como primer comentario</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#f59e0b;font-size:14px;margin-right:8px;">⚡</span>
                          <span style="color:#d4d4d8;font-size:13px;">Crea una segunda parte si supera 500 comentarios</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Crear otro -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <a href="${APP_URL}/dashboard/projects/new"
                style="display:inline-block;background:#18181b;border:1px solid #3f3f46;color:#a78bfa;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:12px;">
                + Crear otro video viral
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#52525b;">
                VYNAVO · Microseries IA<br />
                <a href="${APP_URL}" style="color:#52525b;">vynavo.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
