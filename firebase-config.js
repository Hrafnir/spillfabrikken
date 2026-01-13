/* Version: #5 */
/* 
   === FIREBASE KONFIGURASJON ===
   Denne filen håndterer tilkoblingen til Firebase.
   Variablene 'auth', 'db' og 'storage' blir tilgjengelige for alle andre script.
*/

const firebaseConfig = {
  apiKey: "AIzaSyADgJ4KPhQ_mcbIJeqWawx7gutjYaNuhr8",
  authDomain: "spillfabrikken-14ea4.firebaseapp.com",
  projectId: "spillfabrikken-14ea4",
  storageBucket: "spillfabrikken-14ea4.firebasestorage.app",
  messagingSenderId: "260463073750",
  appId: "1:260463073750:web:de3f5c6ed048aa82bdac77",
  measurementId: "G-JPZGLWQZDF"
};

// Globale variabler som script.js kan bruke
let app, auth, db, storage;

try {
    console.log("System: Connecting to Firebase...");
    app = firebase.initializeApp(firebaseConfig);
    
    // Aktiver tjenester
    auth = firebase.auth();          // Innlogging
    db = firebase.firestore();       // Database (til prosjekter)
    storage = firebase.storage();    // Lagring (til bilder)

    console.log("System: Firebase connected successfully.");
} catch (e) {
    console.error("CRITICAL: Firebase configuration failed.", e);
    alert("Kritisk feil: Kunne ikke koble til Firebase. Sjekk firebase-config.js");
}

/* Version: #5 */
