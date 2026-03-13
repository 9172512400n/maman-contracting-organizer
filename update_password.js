const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
admin.auth().getUserByEmail('nir@mamancontracting.com')
  .then(user => admin.auth().updateUser(user.uid, { password: 'Maman2024!' }))
  .then(() => { console.log('Password updated to: Maman2024!'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
