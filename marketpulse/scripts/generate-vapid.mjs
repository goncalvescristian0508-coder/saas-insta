// Gera um par de chaves VAPID para Web Push. Execute: npm run vapid
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Adicione ao seu .env.local / Vercel:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:seu-email@exemplo.com');
