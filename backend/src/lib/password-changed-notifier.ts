import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import type {
  INotificationModuleService,
  Logger,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { EmailTemplates } from "../modules/email-notifications/templates"
import { Sentry } from "./instrument"
import {
  resolveCustomerEmailLocaleByEmail,
  type EmailLocale,
} from "./email-locale"
import {
  EMAIL_DATE_LOCALE,
  PASSWORD_CHANGED_I18N,
} from "../modules/email-notifications/templates/email-i18n"

function formatDateTime(date: Date, locale: EmailLocale): string {
  try {
    return new Intl.DateTimeFormat(EMAIL_DATE_LOCALE[locale] ?? "nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function formatDateEN(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function resolveActorType(url: string): "customer" | "user" | null {
  if (url.includes("/auth/customer/")) return "customer"
  if (url.includes("/auth/user/")) return "user"
  return null
}

export function passwordChangedNotifier() {
  return function passwordChangedMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const actorType = resolveActorType(req.originalUrl || req.url || "")
    if (!actorType) return next()

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return

      const authCtx = (req as unknown as { auth_context?: { actor_id?: string } })
        .auth_context
      const recipient =
        authCtx?.actor_id ??
        (req.body as { email?: unknown } | undefined)?.email
      if (typeof recipient !== "string" || !recipient.includes("@")) return

      const now = new Date()
      const supportEmail =
        process.env.SUPPORT_EMAIL || process.env.CONTACT_EMAIL || undefined
      const isCustomer = actorType === "customer"

      ;(async () => {
        try {
          const locale: EmailLocale = isCustomer
            ? await resolveCustomerEmailLocaleByEmail(req.scope, recipient)
            : "nl"
          const t = PASSWORD_CHANGED_I18N[locale] ?? PASSWORD_CHANGED_I18N.nl
          const changedAt = isCustomer
            ? formatDateTime(now, locale)
            : formatDateEN(now)
          const subject = isCustomer
            ? t.subject
            : "Your Inovix admin password was changed"
          const textBody = isCustomer
            ? `${t.intro(changedAt)}\n\n${t.warning(supportEmail)}`
            : `Your Inovix admin password was just changed at ${changedAt}.\n\n` +
              `Was this not you? Contact us immediately${
                supportEmail ? ` at ${supportEmail}` : ""
              } and change your password right away.`

          const notificationModuleService: INotificationModuleService =
            req.scope.resolve(Modules.NOTIFICATION)
          await notificationModuleService.createNotifications({
            to: recipient,
            channel: "email",
            template: EmailTemplates.PASSWORD_CHANGED,
            data: {
              emailOptions: {
                subject,
                text: textBody,
                ...(supportEmail ? { replyTo: supportEmail } : {}),
              },
              actorType,
              changedAt,
              locale,
              ...(supportEmail ? { supportEmail } : {}),
            },
          })
        } catch (error) {
          const logger: Logger = req.scope.resolve("logger")
          logger.error(
            `password-changed-notifier: failed to send confirmation to ${recipient}: ${
              (error as Error).message
            }`
          )
          Sentry.captureException(error, {
            tags: { middleware: "password-changed-notifier", actor_type: actorType },
          })
        }
      })()
    })

    next()
  }
}
