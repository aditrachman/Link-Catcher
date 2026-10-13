/* Login Google + sinkronisasi Firestore. Modul ES, dimuat dari CDN Firebase.
   Logika merge ada di app.js (SLCApp); file ini hanya pembungkus tipis atas SDK. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Kunci web Firebase memang publik; yang melindungi data adalah firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyC1MVDj9H-uzlFBEnTfMcbIDOCQFmrDYvg',
  authDomain: 'link-catcher-fe7ae.firebaseapp.com',
  projectId: 'link-catcher-fe7ae',
  storageBucket: 'link-catcher-fe7ae.firebasestorage.app',
  messagingSenderId: '500247458689',
  appId: '1:500247458689:web:84820f6706eb73354aae80'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

let uid = null;
let unsub = null;

function noteRef(id) { return doc(db, 'users', uid, 'notes', id); }

function toDoc(n) {
  const d = {
    summary: String(n.summary || '').slice(0, 3000),
    rawText: String(n.rawText || '').slice(0, 50000),
    links: (n.links || []).slice(0, 300),
    tags: (n.tags || []).slice(0, 8),
    mode: n.mode === 'list' ? 'list' : 'prose',
    items: n.items || null,
    pinned: !!n.pinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  };
  return JSON.parse(JSON.stringify(d)); // buang undefined (Firestore menolaknya)
}

const isIOSStandalone = () => window.navigator.standalone === true;

async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (isIOSStandalone()) { await signInWithRedirect(auth, provider); return; }
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

window.SLCSync = {
  ready: () => !!uid,
  push: (n) => setDoc(noteRef(n.id), toDoc(n)),
  remove: (id) => deleteDoc(noteRef(id)),
  signIn,
  signOut: () => signOut(auth)
};

getRedirectResult(auth).catch((e) => {
  if (window.SLCApp) window.SLCApp.toast('Login gagal (' + (e.code || 'error') + ')');
});

onAuthStateChanged(auth, (user) => {
  if (unsub) { unsub(); unsub = null; }
  uid = user ? user.uid : null;
  const App = window.SLCApp;
  if (!App) return;
  App.setUser(user ? { uid: user.uid, name: user.displayName, email: user.email, photo: user.photoURL } : null);
  if (!user) return;
  unsub = onSnapshot(
    collection(db, 'users', uid, 'notes'),
    { includeMetadataChanges: true },
    (snap) => {
      const remote = snap.docs.map((d) => ({ id: d.id, ...d.data(), __pending: d.metadata.hasPendingWrites }));
      App.applyRemote(remote, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
    },
    (err) => App.setSync('error', err.code)
  );
});
