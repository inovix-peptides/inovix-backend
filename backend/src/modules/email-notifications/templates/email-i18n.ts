import type { EmailLocale } from '../../../lib/email-locale'

/**
 * Translations for the customer-facing transactional emails. Dutch is the
 * source of truth; German uses the formal "Sie". Admin-facing emails
 * (invite-user, abandoned-cart-paid, the `user` actor variants of the
 * password emails) intentionally stay untranslated.
 *
 * Conventions: no em dashes (use | , :), and the research-use-only
 * disclaimer must keep its exact meaning in every language.
 */

export const EMAIL_DATE_LOCALE: Record<EmailLocale, string> = {
  nl: 'nl-NL',
  de: 'de-DE',
  en: 'en-IE',
}

export function formatEmailDate(
  date: string | Date,
  locale: EmailLocale
): string {
  try {
    return new Intl.DateTimeFormat(EMAIL_DATE_LOCALE[locale], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(date))
  } catch {
    return String(date)
  }
}

export function formatEmailMoney(
  value: number | string | undefined,
  currencyCode: string | undefined,
  locale: EmailLocale
): string {
  const numeric = typeof value === 'string' ? Number(value) : (value ?? 0)
  try {
    return new Intl.NumberFormat(EMAIL_DATE_LOCALE[locale], {
      style: 'currency',
      currency: currencyCode?.toUpperCase() || 'EUR',
    }).format(numeric)
  } catch {
    return `${numeric.toFixed(2)} ${currencyCode?.toUpperCase() ?? ''}`.trim()
  }
}

// ---------------------------------------------------------------------------
// Shared footer (base.tsx)
// ---------------------------------------------------------------------------

export const FOOTER = {
  nl: {
    disclaimerLead: 'Uitsluitend voor onderzoeksdoeleinden.',
    disclaimerBody:
      ' Producten van Inovix zijn bedoeld voor in-vitro laboratorium onderzoek en niet geschikt voor menselijke of dierlijke consumptie, medische of cosmetische toepassingen.',
    questionsPre: 'Vragen? Reageer op deze e-mail of neem contact met ons op via ',
    privacy: 'Privacybeleid',
    terms: 'Algemene voorwaarden',
  },
  de: {
    disclaimerLead: 'Ausschließlich für Forschungszwecke.',
    disclaimerBody:
      ' Produkte von Inovix sind für die In-vitro-Laborforschung bestimmt und nicht geeignet für den menschlichen oder tierischen Verzehr, medizinische oder kosmetische Anwendungen.',
    questionsPre:
      'Fragen? Antworten Sie auf diese E-Mail oder kontaktieren Sie uns über ',
    privacy: 'Datenschutzerklärung',
    terms: 'Allgemeine Geschäftsbedingungen',
  },
  en: {
    disclaimerLead: 'For research use only.',
    disclaimerBody:
      ' Inovix products are intended for in-vitro laboratory research and are not suitable for human or animal consumption, medical or cosmetic applications.',
    questionsPre: 'Questions? Reply to this email or contact us at ',
    privacy: 'Privacy policy',
    terms: 'Terms and conditions',
  },
} as const satisfies Record<EmailLocale, Record<string, string>>

// ---------------------------------------------------------------------------
// Order placed (confirmation)
// ---------------------------------------------------------------------------

export const ORDER_PLACED_I18N = {
  nl: {
    subject: (displayId: string | number) =>
      `Bestelling bevestigd | Inovix ${displayId}`,
    preview: 'Uw betaling is verwerkt | bestelling bevestigd',
    heading: 'Bedankt voor uw bestelling',
    orderNumber: 'Ordernummer',
    greeting: 'Beste',
    body: 'We hebben uw bestelling ontvangen. Zodra uw bestelling verzonden is, ontvangt u een aparte e-mail met de trackinggegevens.',
    yourOrder: 'Uw bestelling',
    total: 'Totaal',
    inclVat: 'Inclusief btw en verzendkosten.',
    shippingAddress: 'Verzendadres',
  },
  de: {
    subject: (displayId: string | number) =>
      `Bestellung bestätigt | Inovix ${displayId}`,
    preview: 'Ihre Zahlung wurde verarbeitet | Bestellung bestätigt',
    heading: 'Vielen Dank für Ihre Bestellung',
    orderNumber: 'Bestellnummer',
    greeting: 'Sehr geehrte/r',
    body: 'Wir haben Ihre Bestellung erhalten. Sobald Ihre Bestellung versandt wurde, erhalten Sie eine separate E-Mail mit den Sendungsverfolgungsdaten.',
    yourOrder: 'Ihre Bestellung',
    total: 'Gesamtbetrag',
    inclVat: 'Inklusive MwSt. und Versandkosten.',
    shippingAddress: 'Lieferadresse',
  },
  en: {
    subject: (displayId: string | number) =>
      `Order confirmed | Inovix ${displayId}`,
    preview: 'Your payment has been processed | order confirmed',
    heading: 'Thank you for your order',
    orderNumber: 'Order number',
    greeting: 'Dear',
    body: 'We have received your order. As soon as your order ships, you will receive a separate email with the tracking details.',
    yourOrder: 'Your order',
    total: 'Total',
    inclVat: 'Including VAT and shipping costs.',
    shippingAddress: 'Shipping address',
  },
} as const

// Plain-text confirmation body (order-confirmation-text helper).
export const ORDER_PLACED_TEXT_I18N = {
  nl: {
    title: 'Bedankt voor uw bestelling bij Inovix',
    orderNumber: 'Ordernummer',
    greeting: 'Beste',
    body: 'Uw betaling is verwerkt en de bestelling is bevestigd. Zodra uw bestelling verzonden is, ontvangt u een aparte e-mail met de trackinggegevens.',
    yourOrder: 'Uw bestelling:',
    total: 'Totaal',
    inclVat: 'incl. btw en verzendkosten',
    shippingAddress: 'Verzendadres:',
    disclaimer:
      'Uitsluitend voor onderzoeksdoeleinden. Producten van Inovix zijn bedoeld voor in-vitro laboratorium onderzoek en niet geschikt voor menselijke of dierlijke consumptie, medische of cosmetische toepassingen.',
  },
  de: {
    title: 'Vielen Dank für Ihre Bestellung bei Inovix',
    orderNumber: 'Bestellnummer',
    greeting: 'Sehr geehrte/r',
    body: 'Ihre Zahlung wurde verarbeitet und die Bestellung ist bestätigt. Sobald Ihre Bestellung versandt wurde, erhalten Sie eine separate E-Mail mit den Sendungsverfolgungsdaten.',
    yourOrder: 'Ihre Bestellung:',
    total: 'Gesamtbetrag',
    inclVat: 'inkl. MwSt. und Versandkosten',
    shippingAddress: 'Lieferadresse:',
    disclaimer:
      'Ausschließlich für Forschungszwecke. Produkte von Inovix sind für die In-vitro-Laborforschung bestimmt und nicht geeignet für den menschlichen oder tierischen Verzehr, medizinische oder kosmetische Anwendungen.',
  },
  en: {
    title: 'Thank you for your order with Inovix',
    orderNumber: 'Order number',
    greeting: 'Dear',
    body: 'Your payment has been processed and the order is confirmed. As soon as your order ships, you will receive a separate email with the tracking details.',
    yourOrder: 'Your order:',
    total: 'Total',
    inclVat: 'incl. VAT and shipping costs',
    shippingAddress: 'Shipping address:',
    disclaimer:
      'For research use only. Inovix products are intended for in-vitro laboratory research and are not suitable for human or animal consumption, medical or cosmetic applications.',
  },
} as const

// ---------------------------------------------------------------------------
// Order shipped
// ---------------------------------------------------------------------------

export const ORDER_SHIPPED_I18N = {
  nl: {
    subject: (displayId: string | number) =>
      `Uw bestelling is onderweg | Inovix ${displayId}`,
    preview: 'Uw bestelling is onderweg',
    heading: 'Uw bestelling is onderweg',
    orderNumber: 'Ordernummer',
    shippedOn: 'verzonden',
    greeting: 'Beste',
    body: 'Uw pakket is zojuist overgedragen aan de vervoerder. Hieronder vindt u de trackinggegevens en de inhoud van deze zending.',
    trackingHeading: 'Uw pakket is onderweg',
    trackingBody: 'Gebruik de knop hieronder om uw zending live te volgen.',
    trackingNumber: 'Trackingnummer:',
    trackButton: 'Volg uw pakket',
    contents: 'Inhoud van deze zending',
    itemFallback: 'Artikel',
    shippingAddress: 'Verzendadres',
  },
  de: {
    subject: (displayId: string | number) =>
      `Ihre Bestellung ist unterwegs | Inovix ${displayId}`,
    preview: 'Ihre Bestellung ist unterwegs',
    heading: 'Ihre Bestellung ist unterwegs',
    orderNumber: 'Bestellnummer',
    shippedOn: 'versandt am',
    greeting: 'Sehr geehrte/r',
    body: 'Ihr Paket wurde soeben an den Versanddienstleister übergeben. Unten finden Sie die Sendungsverfolgungsdaten und den Inhalt dieser Sendung.',
    trackingHeading: 'Ihr Paket ist unterwegs',
    trackingBody: 'Verwenden Sie die Schaltfläche unten, um Ihre Sendung live zu verfolgen.',
    trackingNumber: 'Sendungsnummer:',
    trackButton: 'Paket verfolgen',
    contents: 'Inhalt dieser Sendung',
    itemFallback: 'Artikel',
    shippingAddress: 'Lieferadresse',
  },
  en: {
    subject: (displayId: string | number) =>
      `Your order is on its way | Inovix ${displayId}`,
    preview: 'Your order is on its way',
    heading: 'Your order is on its way',
    orderNumber: 'Order number',
    shippedOn: 'shipped',
    greeting: 'Dear',
    body: 'Your parcel has just been handed over to the carrier. Below you will find the tracking details and the contents of this shipment.',
    trackingHeading: 'Your parcel is on its way',
    trackingBody: 'Use the button below to track your shipment live.',
    trackingNumber: 'Tracking number:',
    trackButton: 'Track your parcel',
    contents: 'Contents of this shipment',
    itemFallback: 'Item',
    shippingAddress: 'Shipping address',
  },
} as const

// ---------------------------------------------------------------------------
// Payment failed
// ---------------------------------------------------------------------------

export const PAYMENT_FAILED_I18N = {
  nl: {
    subject: 'Betaling mislukt | Inovix',
    preview: 'Uw betaling is niet gelukt, probeer opnieuw',
    heading: 'Betaling mislukt',
    subheading: 'Het bedrag is niet afgeschreven van uw rekening.',
    greeting: 'Beste',
    greetingFallback: 'klant',
    bodyPre: 'Uw betaling van ',
    bodyPost:
      ' kon niet worden verwerkt. Dit kan verschillende oorzaken hebben, zoals onvoldoende saldo, een geblokkeerde kaart of een afgebroken 3D Secure verificatie.',
    cartReady:
      'Uw winkelwagen staat nog voor u klaar. U kunt de betaling opnieuw proberen via de knop hieronder.',
    retryButton: 'Opnieuw proberen',
    helpLine: 'Lukt het niet? Reageer op deze e-mail, dan zoeken wij het voor u uit.',
    textBody: (name: string, amount: string, retryUrl: string) =>
      `Betaling mislukt\n\n` +
      `Beste ${name},\n\n` +
      `Uw betaling van ${amount} kon niet worden verwerkt. ` +
      `Dit kan onvoldoende saldo, een geblokkeerde kaart of afgebroken 3D Secure zijn.\n\n` +
      `Uw winkelwagen staat nog voor u klaar. Probeer opnieuw via:\n${retryUrl}\n\n` +
      `Lukt het niet? Reageer op deze e-mail dan zoeken wij het voor u uit.`,
  },
  de: {
    subject: 'Zahlung fehlgeschlagen | Inovix',
    preview: 'Ihre Zahlung war nicht erfolgreich, bitte versuchen Sie es erneut',
    heading: 'Zahlung fehlgeschlagen',
    subheading: 'Der Betrag wurde nicht von Ihrem Konto abgebucht.',
    greeting: 'Sehr geehrte/r',
    greetingFallback: 'Kunde/Kundin',
    bodyPre: 'Ihre Zahlung über ',
    bodyPost:
      ' konnte nicht verarbeitet werden. Dies kann verschiedene Ursachen haben, etwa unzureichendes Guthaben, eine gesperrte Karte oder eine abgebrochene 3D-Secure-Verifizierung.',
    cartReady:
      'Ihr Warenkorb steht noch für Sie bereit. Sie können die Zahlung über die Schaltfläche unten erneut versuchen.',
    retryButton: 'Erneut versuchen',
    helpLine:
      'Klappt es nicht? Antworten Sie auf diese E-Mail, dann kümmern wir uns darum.',
    textBody: (name: string, amount: string, retryUrl: string) =>
      `Zahlung fehlgeschlagen\n\n` +
      `Sehr geehrte/r ${name},\n\n` +
      `Ihre Zahlung über ${amount} konnte nicht verarbeitet werden. ` +
      `Mögliche Ursachen sind unzureichendes Guthaben, eine gesperrte Karte oder eine abgebrochene 3D-Secure-Verifizierung.\n\n` +
      `Ihr Warenkorb steht noch für Sie bereit. Versuchen Sie es erneut über:\n${retryUrl}\n\n` +
      `Klappt es nicht? Antworten Sie auf diese E-Mail, dann kümmern wir uns darum.`,
  },
  en: {
    subject: 'Payment failed | Inovix',
    preview: 'Your payment did not go through, please try again',
    heading: 'Payment failed',
    subheading: 'The amount has not been charged to your account.',
    greeting: 'Dear',
    greetingFallback: 'customer',
    bodyPre: 'Your payment of ',
    bodyPost:
      ' could not be processed. This can have several causes, such as insufficient funds, a blocked card or a cancelled 3D Secure verification.',
    cartReady:
      'Your cart is still waiting for you. You can retry the payment using the button below.',
    retryButton: 'Try again',
    helpLine: 'Not working? Reply to this email and we will sort it out for you.',
    textBody: (name: string, amount: string, retryUrl: string) =>
      `Payment failed\n\n` +
      `Dear ${name},\n\n` +
      `Your payment of ${amount} could not be processed. ` +
      `This can be caused by insufficient funds, a blocked card or a cancelled 3D Secure verification.\n\n` +
      `Your cart is still waiting for you. Try again via:\n${retryUrl}\n\n` +
      `Not working? Reply to this email and we will sort it out for you.`,
  },
} as const

// ---------------------------------------------------------------------------
// Order cancelled
// ---------------------------------------------------------------------------

export const ORDER_CANCELLED_I18N = {
  nl: {
    subject: (displayId: string | number) =>
      `Bestelling geannuleerd | Inovix ${displayId}`,
    preview: 'Uw bestelling is geannuleerd',
    heading: 'Uw bestelling is geannuleerd',
    orderNumber: 'Ordernummer',
    greeting: 'Beste',
    body: (displayId: string | number) =>
      `We bevestigen dat uw bestelling #${displayId} is geannuleerd. Het volledige bedrag wordt teruggestort naar de oorspronkelijke betaalmethode.`,
    cancelledItems: 'Geannuleerde artikelen',
    refundAmount: 'Terug te storten bedrag',
    inclVat: 'Inclusief btw en verzendkosten.',
    whenHeading: 'Wanneer ontvangt u uw geld terug?',
    whenBody1:
      'De terugstorting wordt direct in gang gezet. Afhankelijk van uw bank of kaartuitgever kan het 5 tot 10 werkdagen duren voordat het bedrag op uw rekening zichtbaar is.',
    whenBody2:
      'U ontvangt een aparte bevestiging zodra de terugstorting is verwerkt. Als u na 10 werkdagen niets heeft ontvangen, neem dan contact met ons op zodat we het samen kunnen nakijken.',
  },
  de: {
    subject: (displayId: string | number) =>
      `Bestellung storniert | Inovix ${displayId}`,
    preview: 'Ihre Bestellung wurde storniert',
    heading: 'Ihre Bestellung wurde storniert',
    orderNumber: 'Bestellnummer',
    greeting: 'Sehr geehrte/r',
    body: (displayId: string | number) =>
      `Wir bestätigen, dass Ihre Bestellung #${displayId} storniert wurde. Der gesamte Betrag wird auf die ursprüngliche Zahlungsmethode zurückerstattet.`,
    cancelledItems: 'Stornierte Artikel',
    refundAmount: 'Zu erstattender Betrag',
    inclVat: 'Inklusive MwSt. und Versandkosten.',
    whenHeading: 'Wann erhalten Sie Ihr Geld zurück?',
    whenBody1:
      'Die Rückerstattung wird sofort eingeleitet. Je nach Bank oder Kartenanbieter kann es 5 bis 10 Werktage dauern, bis der Betrag auf Ihrem Konto sichtbar ist.',
    whenBody2:
      'Sie erhalten eine separate Bestätigung, sobald die Rückerstattung verarbeitet wurde. Sollten Sie nach 10 Werktagen nichts erhalten haben, kontaktieren Sie uns bitte, damit wir das gemeinsam prüfen können.',
  },
  en: {
    subject: (displayId: string | number) =>
      `Order cancelled | Inovix ${displayId}`,
    preview: 'Your order has been cancelled',
    heading: 'Your order has been cancelled',
    orderNumber: 'Order number',
    greeting: 'Dear',
    body: (displayId: string | number) =>
      `We confirm that your order #${displayId} has been cancelled. The full amount will be refunded to the original payment method.`,
    cancelledItems: 'Cancelled items',
    refundAmount: 'Amount to be refunded',
    inclVat: 'Including VAT and shipping costs.',
    whenHeading: 'When will you receive your money back?',
    whenBody1:
      'The refund is initiated immediately. Depending on your bank or card issuer, it can take 5 to 10 business days before the amount is visible in your account.',
    whenBody2:
      'You will receive a separate confirmation once the refund has been processed. If you have not received anything after 10 business days, please contact us so we can look into it together.',
  },
} as const

// ---------------------------------------------------------------------------
// Order refunded
// ---------------------------------------------------------------------------

export const ORDER_REFUNDED_I18N = {
  nl: {
    subject: (displayId: string | number) =>
      `Terugstorting verwerkt | Inovix ${displayId}`,
    preview: 'Uw terugstorting is verwerkt',
    heading: 'Uw terugstorting is verwerkt',
    orderNumber: 'Ordernummer',
    greeting: 'Beste',
    body: 'We bevestigen dat de terugstorting voor uw bestelling is verwerkt. Het bedrag staat over enkele werkdagen op uw rekening, afhankelijk van uw bank of kaartuitgever.',
    refundedAmount: 'Teruggestort bedrag',
    reason: 'Reden:',
    methodNote:
      'De terugstorting wordt naar dezelfde betaalmethode gestuurd waarmee u oorspronkelijk heeft betaald. De verwerkingstijd is doorgaans 5 tot 10 werkdagen.',
    contactNote:
      'Heeft u na 10 werkdagen nog niets ontvangen, of klopt het bedrag niet, neem dan contact met ons op zodat we het direct kunnen oplossen.',
  },
  de: {
    subject: (displayId: string | number) =>
      `Rückerstattung verarbeitet | Inovix ${displayId}`,
    preview: 'Ihre Rückerstattung wurde verarbeitet',
    heading: 'Ihre Rückerstattung wurde verarbeitet',
    orderNumber: 'Bestellnummer',
    greeting: 'Sehr geehrte/r',
    body: 'Wir bestätigen, dass die Rückerstattung für Ihre Bestellung verarbeitet wurde. Der Betrag ist je nach Bank oder Kartenanbieter innerhalb weniger Werktage auf Ihrem Konto.',
    refundedAmount: 'Erstatteter Betrag',
    reason: 'Grund:',
    methodNote:
      'Die Rückerstattung erfolgt auf dieselbe Zahlungsmethode, mit der Sie ursprünglich bezahlt haben. Die Bearbeitungszeit beträgt in der Regel 5 bis 10 Werktage.',
    contactNote:
      'Sollten Sie nach 10 Werktagen noch nichts erhalten haben oder stimmt der Betrag nicht, kontaktieren Sie uns bitte, damit wir das umgehend klären können.',
  },
  en: {
    subject: (displayId: string | number) =>
      `Refund processed | Inovix ${displayId}`,
    preview: 'Your refund has been processed',
    heading: 'Your refund has been processed',
    orderNumber: 'Order number',
    greeting: 'Dear',
    body: 'We confirm that the refund for your order has been processed. The amount will be in your account within a few business days, depending on your bank or card issuer.',
    refundedAmount: 'Refunded amount',
    reason: 'Reason:',
    methodNote:
      'The refund is sent to the same payment method you originally paid with. Processing usually takes 5 to 10 business days.',
    contactNote:
      'If you have not received anything after 10 business days, or the amount is incorrect, please contact us so we can resolve it right away.',
  },
} as const

// ---------------------------------------------------------------------------
// Customer welcome
// ---------------------------------------------------------------------------

export const CUSTOMER_WELCOME_I18N = {
  nl: {
    subject: 'Welkom bij Inovix',
    preview: 'Welkom bij Inovix',
    heading: 'Welkom bij Inovix',
    greeting: 'Beste',
    body: 'Bedankt voor het aanmaken van uw account bij Inovix. U heeft nu toegang tot ons volledige assortiment onderzoeksproducten, kunt eerdere bestellingen inzien en verzendgegevens beheren.',
    howToOrder: 'Hoe te bestellen',
    step1: '1. Bekijk ons assortiment en kies de gewenste peptiden.',
    step2: '2. Voeg producten toe aan uw winkelwagen en ga naar checkout.',
    step3: '3. Bevestig dat de bestelling uitsluitend voor onderzoek is en rond de betaling af.',
    shippingNote:
      'Wij verzenden GMP gecertificeerde, HPLC getoetste peptiden door de gehele EU. Standaard met tracking en discrete verpakking.',
    browseButton: 'Bekijk assortiment',
    accountNotePre: 'Uw account beheert u via ',
    accountNotePost: '. Hier vindt u uw orderhistorie, adressen en accountgegevens.',
  },
  de: {
    subject: 'Willkommen bei Inovix',
    preview: 'Willkommen bei Inovix',
    heading: 'Willkommen bei Inovix',
    greeting: 'Sehr geehrte/r',
    body: 'Vielen Dank für die Erstellung Ihres Kontos bei Inovix. Sie haben nun Zugriff auf unser vollständiges Sortiment an Forschungsprodukten, können frühere Bestellungen einsehen und Versanddaten verwalten.',
    howToOrder: 'So bestellen Sie',
    step1: '1. Sehen Sie sich unser Sortiment an und wählen Sie die gewünschten Peptide.',
    step2: '2. Legen Sie Produkte in Ihren Warenkorb und gehen Sie zur Kasse.',
    step3: '3. Bestätigen Sie, dass die Bestellung ausschließlich für Forschungszwecke ist, und schließen Sie die Zahlung ab.',
    shippingNote:
      'Wir versenden GMP-zertifizierte, HPLC-geprüfte Peptide in die gesamte EU. Standardmäßig mit Sendungsverfolgung und diskreter Verpackung.',
    browseButton: 'Sortiment ansehen',
    accountNotePre: 'Ihr Konto verwalten Sie über ',
    accountNotePost: '. Dort finden Sie Ihre Bestellhistorie, Adressen und Kontodaten.',
  },
  en: {
    subject: 'Welcome to Inovix',
    preview: 'Welcome to Inovix',
    heading: 'Welcome to Inovix',
    greeting: 'Dear',
    body: 'Thank you for creating your account with Inovix. You now have access to our full range of research products, can view previous orders and manage shipping details.',
    howToOrder: 'How to order',
    step1: '1. Browse our range and choose the peptides you need.',
    step2: '2. Add products to your cart and proceed to checkout.',
    step3: '3. Confirm that the order is for research use only and complete the payment.',
    shippingNote:
      'We ship GMP certified, HPLC tested peptides throughout the EU. Tracked and discreetly packaged as standard.',
    browseButton: 'Browse our range',
    accountNotePre: 'You manage your account at ',
    accountNotePost: '. There you will find your order history, addresses and account details.',
  },
} as const

// ---------------------------------------------------------------------------
// Password reset / changed (customer actor only; the `user` actor stays
// English in the template's own copy map)
// ---------------------------------------------------------------------------

export const PASSWORD_RESET_I18N = {
  nl: {
    subject: 'Wachtwoord herstellen | Inovix',
    heading: 'Wachtwoord herstellen',
    intro: 'Er is een verzoek ingediend om het wachtwoord van uw Inovix-account te herstellen.',
    instruction:
      'Klik op de onderstaande knop om een nieuw wachtwoord in te stellen. Deze link verloopt over 15 minuten.',
    button: 'Nieuw wachtwoord instellen',
    fallback: 'Of kopieer en plak deze URL in uw browser:',
    ignore:
      'Heeft u geen wachtwoordherstel aangevraagd? Dan kunt u deze e-mail negeren, uw wachtwoord blijft ongewijzigd.',
    defaultPreview: 'Herstel uw Inovix-wachtwoord',
  },
  de: {
    subject: 'Passwort zurücksetzen | Inovix',
    heading: 'Passwort zurücksetzen',
    intro: 'Es wurde eine Anfrage gestellt, das Passwort Ihres Inovix-Kontos zurückzusetzen.',
    instruction:
      'Klicken Sie auf die Schaltfläche unten, um ein neues Passwort festzulegen. Dieser Link läuft in 15 Minuten ab.',
    button: 'Neues Passwort festlegen',
    fallback: 'Oder kopieren Sie diese URL und fügen Sie sie in Ihren Browser ein:',
    ignore:
      'Haben Sie keine Passwortzurücksetzung angefordert? Dann können Sie diese E-Mail ignorieren, Ihr Passwort bleibt unverändert.',
    defaultPreview: 'Setzen Sie Ihr Inovix-Passwort zurück',
  },
  en: {
    subject: 'Reset your password | Inovix',
    heading: 'Reset your password',
    intro: 'A request was made to reset the password of your Inovix account.',
    instruction:
      'Click the button below to set a new password. This link expires in 15 minutes.',
    button: 'Set new password',
    fallback: 'Or copy and paste this URL into your browser:',
    ignore:
      'Did you not request a password reset? Then you can ignore this email, your password remains unchanged.',
    defaultPreview: 'Reset your Inovix password',
  },
} as const

export const PASSWORD_CHANGED_I18N = {
  nl: {
    subject: 'Uw wachtwoord is gewijzigd | Inovix',
    heading: 'Wachtwoord gewijzigd',
    intro: (when: string) => `Uw Inovix-wachtwoord is zojuist gewijzigd op ${when}.`,
    warning: (support?: string) =>
      `Was u dit niet? Neem direct contact met ons op${
        support ? ` via ${support}` : ''
      } en wijzig uw wachtwoord zo snel mogelijk.`,
    defaultPreview: 'Uw Inovix-wachtwoord is gewijzigd',
  },
  de: {
    subject: 'Ihr Passwort wurde geändert | Inovix',
    heading: 'Passwort geändert',
    intro: (when: string) => `Ihr Inovix-Passwort wurde soeben geändert am ${when}.`,
    warning: (support?: string) =>
      `Waren Sie das nicht? Kontaktieren Sie uns umgehend${
        support ? ` über ${support}` : ''
      } und ändern Sie Ihr Passwort so schnell wie möglich.`,
    defaultPreview: 'Ihr Inovix-Passwort wurde geändert',
  },
  en: {
    subject: 'Your password was changed | Inovix',
    heading: 'Password changed',
    intro: (when: string) => `Your Inovix password was just changed at ${when}.`,
    warning: (support?: string) =>
      `Was this not you? Contact us immediately${
        support ? ` at ${support}` : ''
      } and change your password right away.`,
    defaultPreview: 'Your Inovix password was changed',
  },
} as const
