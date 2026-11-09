// Preserve the site's pending ticket registration when an event uses a fixed Prodamus page.
// No payment is acknowledged here: only the signed provider webhook can mark a ticket paid.
export function fixedEventPaymentLink({ event, orderId, phone, email, urlSuccess, name }) {
  const url = new URL(event.registrationLink)
  if (!event.collectTicketLead || url.protocol !== 'https:' || url.hostname !== 'payform.ru' || url.username || url.password || url.port) throw new Error('invalid_event_payment_page')
  url.searchParams.set('order_id', orderId)
  url.searchParams.set('customer_extra', [event.title, name, orderId].filter(Boolean).join(' | '))
  if (phone) url.searchParams.set('customer_phone', phone)
  if (email) url.searchParams.set('customer_email', email)
  url.searchParams.set('urlSuccess', urlSuccess)
  return url.href
}
