import { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { ref, set, get, update, serverTimestamp } from "firebase/database";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Save/update user profile in DB
        await update(ref(db, `users/${u.uid}`), {
          uid: u.uid,
          name: u.displayName,
          photo: u.photoURL,
          email: u.email,
          lastSeen: Date.now(),
        });
      }
      setUser(u);
    });
    return () => unsub();
  }, []);

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      alert("فيه مشكلة في الـ login، جرب تاني!");
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
