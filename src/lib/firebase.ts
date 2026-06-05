import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey:            'AIzaSyCPyLBMiApOUs3L2K3SVPeF_Z9Klh5jp94',
  authDomain:        'portal-cms-emk.firebaseapp.com',
  projectId:         'portal-cms-emk',
  storageBucket:     'portal-cms-emk.firebasestorage.app',
  messagingSenderId: '987736791169',
  appId:             '1:987736791169:web:de4e33cc8821d9be25d580',
  databaseURL:       'https://portal-cms-emk-default-rtdb.asia-southeast1.firebasedatabase.app',
};

const app = initializeApp(firebaseConfig);

export const auth  = getAuth(app);
export const db    = getFirestore(app);
export const rtdb  = getDatabase(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: 'toeitechno.com' });
