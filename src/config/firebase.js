import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCp8Rjx2SuTxNabf51uFjmKHwbJyBgU7Ps",
  authDomain: "sobatniaga.firebaseapp.com",
  databaseURL: "https://sobatniaga-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sobatniaga",
  storageBucket: "sobatniaga.firebasestorage.app",
  messagingSenderId: "198089863049",
  appId: "1:198089863049:web:15db89ba8985b802ae7b58",
  measurementId: "G-B3DMR942QC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);
export const dbFirestore = getFirestore(app);
export const storage = getStorage(app);