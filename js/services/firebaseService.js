import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCkbdX-B6FfIVplmG98tIvxO0uUv-mYDSw",
  authDomain: "yourlogic-c0b64.firebaseapp.com",
  projectId: "yourlogic-c0b64",
  storageBucket: "yourlogic-c0b64.firebasestorage.app",
  messagingSenderId: "774656497074",
  appId: "1:774656497074:web:07d6d6092d5d176224c0ab",
  measurementId: "G-W4VM6FC3J5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// ユーザーデータの取得（なければ初期化）
export async function fetchOrInitUser(user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
        const initialData = { lastGeneratedAt: null, clearedPuzzles: [], isAdmin: false };
        await setDoc(userDocRef, initialData);
        return initialData;
    }
    return userDoc.data();
}

// 難易度に応じたパズルストックの取得
export async function fetchPuzzlesByDifficulty(difficulty) {
    const q = query(
        collection(db, "puzzles"),
        where("type", "==", "sudoku"),
        where("difficulty", "==", difficulty)
    );
    const querySnapshot = await getDocs(q);
    const puzzles = [];
    querySnapshot.forEach((doc) => {
        puzzles.push({ id: doc.id, ...doc.data() });
    });
    return puzzles;
}

// 新規生成パズルをDBに保存
export async function saveNewPuzzle(uid, difficulty, puzzleData) {
    const docRef = await addDoc(collection(db, "puzzles"), {
        type: "sudoku",
        difficulty: difficulty,
        problemData: puzzleData.problemData,
        solutionData: puzzleData.solutionData,
        createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "users", uid), {
        lastGeneratedAt: serverTimestamp()
    });

    return docRef.id;
}

// クリア実績の保存
export async function saveClearRecord(uid, puzzleId) {
    await updateDoc(doc(db, "users", uid), {
        clearedPuzzles: arrayUnion(puzzleId)
    });
}
