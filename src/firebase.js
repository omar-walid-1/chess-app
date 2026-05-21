import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDRyBw3yqX6lBqdTioQJFLFNBhYhwLbFpU",
  authDomain: "chess-mar.firebaseapp.com",
  databaseURL: "https://chess-mar-default-rtdb.firebaseio.com",
  projectId: "chess-mar",
  storageBucket: "chess-mar.firebasestorage.app",
  messagingSenderId: "952770796018",
  appId: "1:952770796018:web:4b508d22f39198bdc8736b",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
