/**
 * Helper to open WhatsApp chat.
 * On PC (Windows / Mac), uses the custom 'whatsapp://' URI protocol
 * to open the native installed WhatsApp Desktop application directly,
 * without opening a blank browser tab or redirecting to WhatsApp Web.
 * On mobile, uses 'whatsapp://' (or falls back to 'wa.me') to trigger the mobile app.
 */
export const openWhatsApp = (phone?: string, message: string = '', options: { forceWeb?: boolean } = {}) => {
  const clean = (phone || '').replace(/\D/g, '');
  let fullPhone = '';
  if (clean) {
    fullPhone = (clean.length >= 12 && clean.startsWith('55')) ? clean : `55${clean}`;
  }
  const encoded = encodeURIComponent(message);

  if (options.forceWeb) {
    const webUrl = fullPhone
      ? `https://web.whatsapp.com/send?phone=${fullPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(webUrl, '_blank');
    return;
  }

  // Deep link protocol for WhatsApp Desktop / Native App
  const appUrl = fullPhone
    ? `whatsapp://send?phone=${fullPhone}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) {
    // On PC (Windows / Mac), clicking an invisible anchor with the custom protocol
    // directly invokes WhatsApp Desktop without opening an extra blank tab in Chrome/Edge.
    const link = document.createElement('a');
    link.href = appUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 200);
  } else {
    // On mobile devices, wa.me opens the app cleanly or directs to the store
    const mobileUrl = fullPhone
      ? `https://wa.me/${fullPhone}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(mobileUrl, '_blank');
  }
};
