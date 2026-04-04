// scripts/test-push.js
// node scripts/test-push.js
require('dotenv').config({ path: '.env' });
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_CONTACT_EMAIL ?? 'mailto:contact@example.fr',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// Colle ici UN de tes abonnements depuis Supabase
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/dc1eXro7GrA:APA91bFlFL95lZjwPDTKMC5Q4OeG8u8wMpqWOMa9L95RwaTOIMSDmLm7bh3MHFIe28tZ-Ew51pwXm2-QyD0auclUqOY8bGN4TIVkRbOBPOvbKr-BcP9zLm-xywSpfr_gneVp1gsScdMj",
  keys: {
    p256dh: "BFYsFzcRAHEqZl7aOlWBNg3qjarafPokwroRFHzpbcIrIT_4g2ZbNv4LRRGoJbNJP81UmSxw1cdP8vdnBei63lg",
    auth: "AYighCqjUi0PamDiFYOcWA"
  }
};

const payload = JSON.stringify({
  title: "Test Sauve Mie",
  body: "Notification de test",
  url: "/boulanger"
});

webpush.sendNotification(subscription, payload)
  .then(res => console.log('✅ Envoyé:', res.statusCode))
  .catch(err => console.error('❌ Erreur:', err.statusCode, err.body));